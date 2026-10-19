import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ServerResponse } from "node:http";
import { requireMember } from "./auth.js";
import { db } from "./supabase.js";
import { requireDevice, type DeviceRow } from "./routes/devices.js";

// Biru Cam live view: the Pi relays JPEG frames through here to household
// members' browsers, and only while someone is watching (CAM-PLAN.md §7).
//
//   Pi      GET  /ingest/cam/wait   long-poll; returns as soon as a viewer attaches
//   Pi      POST /ingest/cam/frame  one JPEG; the reply says whether anyone still watches
//   browser GET  /cam/:id/stream    multipart/x-mixed-replace of those frames
//
// The Pi only ever connects out, so nothing at home is exposed. Like the
// events bus, this state is in-process: fine for a single Railway replica.

const WAIT_MS = 25_000; // under Railway's proxy idle timeout
const MAX_VIEWERS = 4;
const MAX_FRAME_BYTES = 512 * 1024;
const FRESH_MS = 2_000; // a new viewer gets the last frame at once if it's this recent
const SLOW_VIEWER_BYTES = 1024 * 1024; // skip frames for a viewer this far behind
const SEEN_EVERY_MS = 30_000;

interface Cam {
  viewers: Set<ServerResponse>;
  waiters: Set<() => void>;
  frame: Buffer | null;
  frameAt: number;
  seenAt: number;
  /** The Pi uploads several frames at once; drop one that lands after a newer one. */
  session: string;
  seq: number;
}
const cams = new Map<string, Cam>();

function cam(id: string): Cam {
  let c = cams.get(id);
  if (!c) cams.set(id, (c = { viewers: new Set(), waiters: new Set(), frame: null, frameAt: 0, seenAt: 0, session: "", seq: 0 }));
  return c;
}

/** Cameras with someone watching right now — surfaced on /healthz. */
export function liveCamCount(): number {
  let n = 0;
  for (const c of cams.values()) if (c.viewers.size) n++;
  return n;
}

function writeFrame(res: ServerResponse, frame: Buffer) {
  res.write(`--FRAME\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
  res.write(frame);
  res.write("\r\n");
}

async function requireCamera(req: FastifyRequest, reply: FastifyReply): Promise<DeviceRow | null> {
  const device = await requireDevice(req, reply);
  if (!device) return null;
  if (device.type !== "camera") {
    reply.code(403).send({ error: "not a camera" });
    return null;
  }
  const c = cam(device.id);
  if (Date.now() - c.seenAt > SEEN_EVERY_MS) {
    c.seenAt = Date.now();
    void db.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id).then(() => {});
  }
  return device;
}

export function camRoutes(app: FastifyInstance) {
  app.addContentTypeParser("image/jpeg", { parseAs: "buffer", bodyLimit: MAX_FRAME_BYTES }, (_req, body, done) =>
    done(null, body)
  );

  app.get("/ingest/cam/wait", async (req, reply) => {
    const device = await requireCamera(req, reply);
    if (!device) return;
    const c = cam(device.id);
    if (c.viewers.size) return reply.send({ watching: true });
    const watching = await new Promise<boolean>((resolve) => {
      const wake = () => finish(true);
      const timer = setTimeout(() => finish(false), WAIT_MS);
      function finish(v: boolean) {
        clearTimeout(timer);
        c.waiters.delete(wake);
        resolve(v);
      }
      c.waiters.add(wake);
      reply.raw.on("close", () => finish(false)); // the Pi went away mid-poll
    });
    return reply.send({ watching });
  });

  app.post("/ingest/cam/frame", async (req, reply) => {
    const device = await requireCamera(req, reply);
    if (!device) return;
    const frame = req.body;
    if (!Buffer.isBuffer(frame) || frame.length < 4 || frame[0] !== 0xff || frame[1] !== 0xd8)
      return reply.code(400).send({ error: "expected one image/jpeg frame" });
    const c = cam(device.id);
    const session = String(req.headers["x-frame-session"] ?? "");
    const seq = Number(req.headers["x-frame-seq"] ?? 0);
    if (session && session === c.session && seq <= c.seq) return reply.send({ watching: c.viewers.size > 0 });
    c.session = session;
    c.seq = seq;
    c.frame = frame;
    c.frameAt = Date.now();
    for (const res of c.viewers) if (res.writableLength < SLOW_VIEWER_BYTES) writeFrame(res, frame);
    return reply.send({ watching: c.viewers.size > 0 });
  });

  app.get("/cam/:id/stream", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const { data } = await db
      .from("devices")
      .select("id")
      .eq("id", id)
      .eq("household_id", caller.householdId)
      .eq("type", "camera")
      .is("revoked_at", null)
      .maybeSingle();
    if (!data) return reply.code(404).send({ error: "no such camera" });
    const c = cam(id);
    if (c.viewers.size >= MAX_VIEWERS) return reply.code(429).send({ error: "too many people watching" });

    // Take the socket away from Fastify, like /events: the response streams until the viewer leaves.
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "multipart/x-mixed-replace; boundary=FRAME",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      // hijacked replies bypass @fastify/cors, so echo the (already validated) origin
      ...(req.headers.origin
        ? { "Access-Control-Allow-Origin": req.headers.origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" }
        : {}),
    });
    if (c.frame && Date.now() - c.frameAt < FRESH_MS) writeFrame(res, c.frame);
    c.viewers.add(res);
    for (const wake of [...c.waiters]) wake(); // tell the Pi to start sending

    const close = () => {
      c.viewers.delete(res);
      res.end();
    };
    res.on("close", close);
    res.on("error", close);
  });
}
