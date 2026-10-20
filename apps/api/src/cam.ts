import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ServerResponse } from "node:http";
import crypto from "node:crypto";
import { CamCandidateSchema, DEVICE_KIND_LABEL, routineKindKey, localDay, HOUSEHOLD_TZ } from "@biru/shared";
import { requireMember } from "./auth.js";
import { db, PHOTO_BUCKET } from "./supabase.js";
import { publish } from "./events.js";
import { classifierReady, classifyStrip } from "./classify.js";
import { requireDevice, type DeviceRow } from "./routes/devices.js";
import { ROUTINE_COLS, routineDtos } from "./routes/routine.js";

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

// pee/poop detection (CAM-PLAN.md §4): the Pi sends pad visits and still spells, Claude judges
const MIN_CONFIDENCE = 0.6; // below this a "pee"/"poop" verdict isn't logged
const SAME_EVENT_MS = 2 * 60_000; // same kind already in the book this close → same event
const MAX_CANDIDATES_PER_HOUR = 60;
const candidateTimes = new Map<string, number[]>();

interface Cam {
  viewers: Set<ServerResponse>;
  waiters: Set<() => void>;
  frame: Buffer | null;
  /** the Pi's detections for `frame`, re-serialised JSON (VISION-PLAN.md) — "" when none */
  boxes: string;
  frameAt: number;
  seenAt: number;
  /** The Pi uploads several frames at once; drop one that lands after a newer one. */
  session: string;
  seq: number;
}
const cams = new Map<string, Cam>();

function cam(id: string): Cam {
  let c = cams.get(id);
  if (!c) cams.set(id, (c = { viewers: new Set(), waiters: new Set(), frame: null, boxes: "", frameAt: 0, seenAt: 0, session: "", seq: 0 }));
  return c;
}

/** Cameras with someone watching right now — surfaced on /healthz. */
export function liveCamCount(): number {
  let n = 0;
  for (const c of cams.values()) if (c.viewers.size) n++;
  return n;
}

const BOX_CLASSES = new Set(["dog", "cat", "person"]);
const MAX_BOXES_HEADER = 4096;

/** Validate the Pi's X-Detections header and re-serialise it — it goes into viewers' part headers. */
function parseBoxes(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > MAX_BOXES_HEADER) return "";
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return "";
  }
  if (!Array.isArray(list)) return "";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0);
  const boxes = list
    .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null && BOX_CLASSES.has(String(b.cls)))
    .slice(0, 20)
    .map((b) => ({ cls: String(b.cls), conf: num(b.conf), x: num(b.x), y: num(b.y), w: num(b.w), h: num(b.h), track: num(b.track) }));
  return JSON.stringify(boxes);
}

function writeFrame(res: ServerResponse, frame: Buffer, boxes: string) {
  const extra = boxes ? `X-Detections: ${boxes}\r\n` : "";
  res.write(`--FRAME\r\nContent-Type: image/jpeg\r\n${extra}Content-Length: ${frame.length}\r\n\r\n`);
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
    if (c.viewers.size) return reply.send({ watching: true, pad: device.pad });
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
    return reply.send({ watching, pad: device.pad });
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
    if (session && session === c.session && seq <= c.seq)
      return reply.send({ watching: c.viewers.size > 0, pad: device.pad });
    c.session = session;
    c.seq = seq;
    c.frame = frame;
    c.boxes = parseBoxes(req.headers["x-detections"]);
    c.frameAt = Date.now();
    for (const res of c.viewers) if (res.writableLength < SLOW_VIEWER_BYTES) writeFrame(res, frame, c.boxes);
    // the pad rides along so a fresh mark on the live tab reaches the Pi within a frame
    return reply.send({ watching: c.viewers.size > 0, pad: device.pad });
  });

  // A still spell from the Pi → "pee, poop, or neither?" → maybe an unconfirmed entry.
  app.post("/ingest/cam/candidate", { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const device = await requireCamera(req, reply);
    if (!device) return;
    const parsed = CamCandidateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const now = Date.now();
    const recent = (candidateTimes.get(device.id) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= MAX_CANDIDATES_PER_HOUR) return reply.code(429).send({ error: "too many candidates this hour" });
    candidateTimes.set(device.id, [...recent, now]);
    if (!classifierReady()) return reply.code(503).send({ error: "classifier not configured (ANTHROPIC_API_KEY)" });

    const cand = parsed.data;
    const padEvidence = cand.onPad && cand.padBefore && cand.padAfter ? { before: cand.padBefore, after: cand.padAfter } : undefined;
    let verdict;
    try {
      verdict = await classifyStrip(cand.crops, padEvidence);
    } catch (err) {
      req.log.error({ err }, "cam classify failed");
      return reply.code(502).send({ error: "classifier unavailable" });
    }
    req.log.info(
      { device: device.id, verdict, still: cand.stillSeconds, onPad: cand.onPad ?? false, padChange: cand.padChange },
      "cam verdict"
    );
    if (!verdict || verdict.label === "neither" || verdict.confidence < MIN_CONFIDENCE)
      return reply.send({ label: verdict?.label ?? "unknown", confidence: verdict?.confidence ?? null, logged: false });

    // when the dog settled, if the Pi's clock is plausible
    let happened = new Date(cand.startedAt * 1000);
    if (Math.abs(now - happened.getTime()) > 10 * 60_000) happened = new Date(now);
    const kinds = verdict.label === "both" ? (["pee", "poop"] as const) : ([verdict.label] as const);
    const logged: string[] = [];
    for (const kind of kinds) {
      const label = DEVICE_KIND_LABEL[kind];
      const { data: dupe } = await db
        .from("routine_items")
        .select("id")
        .eq("household_id", device.household_id)
        .eq("kind_key", routineKindKey(label))
        .gte("happened_at", new Date(happened.getTime() - SAME_EVENT_MS).toISOString())
        .lte("happened_at", new Date(happened.getTime() + SAME_EVENT_MS).toISOString())
        .limit(1)
        .maybeSingle();
      if (dupe) continue;

      const id = crypto.randomUUID();
      const path = `${device.household_id}/routine/${id}.jpg`;
      // a pad visit's best photo is the pad afterwards — that's what a member checks before ✓
      const photo = padEvidence && cand.padChange && cand.padChange > 0 ? padEvidence.after : cand.snapshot;
      const { error: upErr } = await db.storage
        .from(PHOTO_BUCKET)
        .upload(path, Buffer.from(photo, "base64"), { contentType: "image/jpeg" });
      const { data: row, error } = await db
        .from("routine_items")
        .insert({
          id,
          household_id: device.household_id,
          day: localDay(happened, HOUSEHOLD_TZ),
          kind: label,
          kind_key: routineKindKey(label),
          note: `${cand.onPad ? "on the pad · " : ""}${verdict.posture}`.slice(0, 200),
          happened_at: happened.toISOString(),
          created_by: device.created_by,
          device_id: device.id,
          confirmed: false,
          snapshot_path: upErr ? null : path,
          confidence: verdict.confidence,
        })
        .select(ROUTINE_COLS)
        .single();
      if (error || !row) return reply.code(500).send({ error: error?.message ?? "insert failed" });
      const [item] = await routineDtos([row], device.household_id);
      publish(device.household_id, { type: "routine.added", item, source: "camera" });
      logged.push(id);
    }
    if (!logged.length) return reply.send({ ...verdict, logged: false, duplicate: true });
    return reply.code(201).send({ ...verdict, logged: true, ids: logged });
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
    if (c.frame && Date.now() - c.frameAt < FRESH_MS) writeFrame(res, c.frame, c.boxes);
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
