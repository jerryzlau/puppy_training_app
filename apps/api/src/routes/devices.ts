import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import {
  CreateDeviceSchema,
  ClaimDeviceSchema,
  IngestRoutineSchema,
  DEVICE_KIND_LABEL,
  routineKindKey,
  localDay,
  HOUSEHOLD_TZ,
  type DeviceDto,
  type DeviceTodayDto,
} from "@biru/shared";
import { requireMember } from "../auth.js";
import { db } from "../supabase.js";
import { publish } from "../events.js";
import { friendHouseholdIds } from "../friendships.js";

// Biru Buttons — see hardware/PLAN.md §3–5. A device holds a long-lived token
// (only its hash is stored here) that can do exactly one thing: log pee/poop/
// food to the household that paired it.

const CLAIM_TTL_MIN = 15;
const MAX_DEVICES = 10;
const MAX_PRESSES_PER_DAY = 100;
// The same kind logged again within this window is the same event: a nervous
// double press, a second button, or a partner tapping the chip at the same time.
const DEBOUNCE_MS = 60_000;
// unambiguous alphabet: no 0/O/1/I
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface DeviceRow {
  id: string;
  household_id: string;
  name: string;
  claim_code: string | null;
  claim_expires_at: string | null;
  claimed_at: string | null;
  created_by: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const DEVICE_COLS =
  "id, household_id, name, claim_code, claim_expires_at, claimed_at, created_by, last_seen_at, revoked_at, created_at";

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

function claimCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

const toDto = (r: DeviceRow): DeviceDto => {
  const unpaired = !r.claimed_at && r.claim_expires_at && new Date(r.claim_expires_at) > new Date();
  return {
    id: r.id,
    name: r.name,
    claimCode: unpaired ? r.claim_code : null,
    claimExpiresAt: unpaired ? r.claim_expires_at : null,
    claimedAt: r.claimed_at,
    lastSeenAt: r.last_seen_at,
    createdAt: r.created_at,
  };
};

/** Device-token auth for the ingest path. Not requireMember: the device is not a user. */
async function requireDevice(req: FastifyRequest, reply: FastifyReply): Promise<DeviceRow | null> {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Device" || !token) {
    reply.code(401).send({ error: "device token required" });
    return null;
  }
  const { data } = await db
    .from("devices")
    .select(DEVICE_COLS)
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  const row = data as DeviceRow | null;
  if (!row || row.revoked_at) {
    reply.code(401).send({ error: "unknown or revoked device" });
    return null;
  }
  return row;
}

/** Everything logged today (by anyone — app or device) for the household. */
async function todayCounts(householdId: string): Promise<DeviceTodayDto> {
  const day = localDay(new Date(), HOUSEHOLD_TZ);
  const { data } = await db
    .from("routine_items")
    .select("kind_key")
    .eq("household_id", householdId)
    .eq("day", day);
  const out: DeviceTodayDto = { day, pee: 0, poop: 0, food: 0 };
  for (const r of (data ?? []) as { kind_key: string }[]) {
    if (r.kind_key === routineKindKey(DEVICE_KIND_LABEL.pee)) out.pee++;
    else if (r.kind_key === routineKindKey(DEVICE_KIND_LABEL.poop)) out.poop++;
    else if (r.kind_key === routineKindKey(DEVICE_KIND_LABEL.food)) out.food++;
  }
  return out;
}

export function deviceRoutes(app: FastifyInstance) {
  app.get("/devices", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { data, error } = await db
      .from("devices")
      .select(DEVICE_COLS)
      .eq("household_id", caller.householdId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ devices: ((data ?? []) as DeviceRow[]).map(toDto) });
  });

  app.post("/devices", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const parsed = CreateDeviceSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { count } = await db
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("household_id", caller.householdId)
      .is("revoked_at", null);
    if ((count ?? 0) >= MAX_DEVICES)
      return reply.code(409).send({ error: `max ${MAX_DEVICES} gadgets per household` });
    const { data, error } = await db
      .from("devices")
      .insert({
        household_id: caller.householdId,
        name: parsed.data.name?.trim() || "button pad",
        claim_code: claimCode(),
        claim_expires_at: new Date(Date.now() + CLAIM_TTL_MIN * 60_000).toISOString(),
        created_by: caller.userId,
      })
      .select(DEVICE_COLS)
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(toDto(data as DeviceRow));
  });

  // Revoke: the token is dead immediately (requireDevice checks revoked_at).
  app.delete("/devices/:id", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const { error } = await db
      .from("devices")
      .update({ revoked_at: new Date().toISOString(), claim_code: null })
      .eq("id", id)
      .eq("household_id", caller.householdId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });

  // Public, code-gated: the device trades a one-time claim code for its token.
  // The token is returned exactly once; only its hash is kept.
  app.post("/devices/claim", async (req, reply) => {
    const parsed = ClaimDeviceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "claimCode required" });
    const code = parsed.data.claimCode.trim().toUpperCase();
    const { data } = await db
      .from("devices")
      .select(DEVICE_COLS)
      .eq("claim_code", code)
      .is("claimed_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    const row = data as DeviceRow | null;
    if (!row || !row.claim_expires_at || new Date(row.claim_expires_at) < new Date())
      return reply.code(404).send({ error: "claim code is invalid or expired" });
    const token = crypto.randomBytes(32).toString("base64url");
    // Conditional update makes the code single-use even under a race.
    const { data: updated, error } = await db
      .from("devices")
      .update({
        token_hash: hashToken(token),
        claimed_at: new Date().toISOString(),
        claim_code: null,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .is("claimed_at", null)
      .select("id");
    if (error) return reply.code(500).send({ error: error.message });
    if (!updated?.length) return reply.code(404).send({ error: "claim code already used" });
    return reply.code(201).send({ deviceToken: token, deviceId: row.id, name: row.name });
  });

  // What the pad's screen shows. Polled every few minutes; the press response
  // carries the same shape so the screen updates the instant a button is hit.
  app.get("/ingest/today", async (req, reply) => {
    const device = await requireDevice(req, reply);
    if (!device) return;
    void db.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id).then(() => {});
    return reply.send(await todayCounts(device.household_id));
  });

  // The press path (PLAN.md §4).
  app.post("/ingest/routine", async (req, reply) => {
    const device = await requireDevice(req, reply);
    if (!device) return;
    const parsed = IngestRoutineSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { kind, pressId, pressedAt } = parsed.data;

    const nowIso = new Date().toISOString();
    void db.from("devices").update({ last_seen_at: nowIso }).eq("id", device.id).then(() => {});

    // dedupe: a retry after a timeout must not double-log
    const { data: existing } = await db
      .from("routine_items")
      .select("id")
      .eq("press_id", pressId)
      .maybeSingle();
    if (existing)
      return reply.code(200).send({ id: existing.id, duplicate: true, today: await todayCounts(device.household_id) });

    // Trust the device clock only if it's plausible (synced, not in the future, <7 days old).
    let happened = new Date();
    if (pressedAt) {
      const t = new Date(pressedAt * 1000);
      const age = Date.now() - t.getTime();
      if (age > -5 * 60_000 && age < 7 * 86_400_000) happened = t;
    }
    const day = localDay(happened, HOUSEHOLD_TZ);
    const label = DEVICE_KIND_LABEL[kind];

    // debounce: an identical kind within a minute (either direction) is
    // acknowledged but not written twice
    const { data: recent } = await db
      .from("routine_items")
      .select("id, happened_at")
      .eq("household_id", device.household_id)
      .eq("kind_key", routineKindKey(label))
      .gte("happened_at", new Date(happened.getTime() - DEBOUNCE_MS).toISOString())
      .lte("happened_at", new Date(happened.getTime() + DEBOUNCE_MS).toISOString())
      .order("happened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent)
      return reply.code(200).send({
        id: recent.id,
        duplicate: true,
        debounced: true,
        happenedAt: recent.happened_at,
        today: await todayCounts(device.household_id),
      });

    const { count } = await db
      .from("routine_items")
      .select("id", { count: "exact", head: true })
      .eq("device_id", device.id)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
    if ((count ?? 0) >= MAX_PRESSES_PER_DAY)
      return reply.code(429).send({ error: "too many presses today" });

    const { data, error } = await db
      .from("routine_items")
      .insert({
        household_id: device.household_id,
        day,
        kind: label,
        kind_key: routineKindKey(label),
        happened_at: happened.toISOString(),
        created_by: device.created_by,
        device_id: device.id,
        press_id: pressId,
      })
      .select("id, note")
      .single();
    if (error) {
      // unique press_id violation from a concurrent retry → treat as duplicate
      if (error.code === "23505") return reply.code(200).send({ duplicate: true });
      return reply.code(500).send({ error: error.message });
    }
    reply.code(201).send({
      id: data.id,
      day,
      happenedAt: happened.toISOString(),
      today: await todayCounts(device.household_id),
    });

    // Live updates — after the response so the button never waits on fan-out.
    const [{ data: member }, friendIds] = await Promise.all([
      db.from("household_members").select("display_name").eq("user_id", device.created_by).maybeSingle(),
      kind === "food" ? Promise.resolve([] as string[]) : friendHouseholdIds(device.household_id),
    ]);
    publish(device.household_id, {
      type: "routine.added",
      source: "device",
      item: {
        id: data.id,
        day,
        kind: label,
        note: null,
        happenedAt: happened.toISOString(),
        createdBy: device.created_by,
        createdByName: member?.display_name ?? "someone",
        viaDevice: true,
      },
    });
    for (const h of friendIds)
      publish(h, { type: "bulletin", householdId: device.household_id, kind: label, happenedAt: happened.toISOString() });
  });
}
