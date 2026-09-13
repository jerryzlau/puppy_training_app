import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { HouseholdEvent } from "@biru/shared";
import { requireMember } from "./auth.js";

// Live updates: a per-household fan-out from the routes that change routine
// items (a button press, a partner's quick-add) to every open app tab of that
// household, over Server-Sent Events.
//
// The bus is in-process: fine while the API runs as a single Railway replica.
// If it ever scales out, swap `publish`/`subscribe` for Postgres NOTIFY or
// Supabase Realtime — the route and the client don't change.

type Listener = (ev: HouseholdEvent, id: number) => void;
const listeners = new Map<string, Set<Listener>>();
let nextId = Date.now();

const HEARTBEAT_MS = 25_000; // keep Railway's proxy from idling the socket out

export function publish(householdId: string, ev: HouseholdEvent): void {
  const set = listeners.get(householdId);
  if (!set?.size) return;
  const id = nextId++;
  for (const fn of set) fn(ev, id);
}

export function subscribe(householdId: string, fn: Listener): () => void {
  let set = listeners.get(householdId);
  if (!set) listeners.set(householdId, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(householdId);
  };
}

/** How many tabs are listening for a household — surfaced on /healthz. */
export function listenerCount(): number {
  let n = 0;
  for (const s of listeners.values()) n += s.size;
  return n;
}

async function streamEvents(req: FastifyRequest, reply: FastifyReply) {
  const caller = await requireMember(req, reply);
  if (!caller) return;

  // Take the socket away from Fastify: this response never "ends" normally.
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    // hijacked replies bypass @fastify/cors, so echo the (already validated) origin
    ...(req.headers.origin
      ? { "Access-Control-Allow-Origin": req.headers.origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" }
      : {}),
  });
  res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ householdId: caller.householdId })}\n\n`);

  const unsubscribe = subscribe(caller.householdId, (ev, id) => {
    res.write(`id: ${id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  };
  req.raw.on("close", close);
  req.raw.on("error", close);
}

export function eventRoutes(app: FastifyInstance) {
  app.get("/events", streamEvents);
}
