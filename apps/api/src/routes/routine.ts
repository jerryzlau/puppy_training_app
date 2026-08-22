import type { FastifyInstance } from "fastify";
import {
  CreateRoutineItemSchema,
  UpdateRoutineItemSchema,
  routineKindKey,
  summarizePattern,
  HOUSEHOLD_TZ,
  type RoutineItemDto,
  type RoutineKindDto,
  type RoutinePatternDto,
} from "@biru/shared";
import { requireMember } from "../auth.js";
import { db } from "../supabase.js";

const PATTERN_DAYS = 21;
const MAX_ITEMS_PER_DAY = 40;

interface Row {
  id: string;
  day: string;
  kind: string;
  kind_key: string;
  note: string | null;
  happened_at: string;
  created_by: string;
}

async function membersMap(householdId: string): Promise<Map<string, string>> {
  const { data } = await db
    .from("household_members")
    .select("user_id, display_name")
    .eq("household_id", householdId);
  return new Map((data ?? []).map((m) => [m.user_id, m.display_name]));
}

const toDto = (r: Row, names: Map<string, string>): RoutineItemDto => ({
  id: r.id,
  day: r.day,
  kind: r.kind,
  note: r.note,
  happenedAt: r.happened_at,
  createdBy: r.created_by,
  createdByName: names.get(r.created_by) ?? "someone",
});

export function routineRoutes(app: FastifyInstance) {
  /** One day's items, earliest first. */
  app.get("/routine", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const q = req.query as { day?: string };
    if (!q.day || !/^\d{4}-\d{2}-\d{2}$/.test(q.day)) {
      return reply.code(400).send({ error: "day=YYYY-MM-DD is required" });
    }
    const { data, error } = await db
      .from("routine_items")
      .select("id, day, kind, kind_key, note, happened_at, created_by")
      .eq("household_id", caller.householdId)
      .eq("day", q.day)
      .order("happened_at", { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });
    const names = await membersMap(caller.householdId);
    return reply.send({ day: q.day, items: (data ?? []).map((r) => toDto(r as Row, names)) });
  });

  /** Titles used before, most-used first — the quick-add chips. */
  app.get("/routine/kinds", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { data, error } = await db
      .from("routine_items")
      .select("kind, kind_key, happened_at")
      .eq("household_id", caller.householdId)
      .order("happened_at", { ascending: false })
      .limit(1000);
    if (error) return reply.code(500).send({ error: error.message });
    const byKey = new Map<string, RoutineKindDto>();
    for (const r of data ?? []) {
      const existing = byKey.get(r.kind_key);
      if (existing) existing.count += 1;
      // rows arrive newest-first, so the first spelling seen is the most recent
      else
        byKey.set(r.kind_key, {
          kind: r.kind,
          kindKey: r.kind_key,
          count: 1,
          lastUsedAt: r.happened_at,
        });
    }
    const kinds = [...byKey.values()].sort(
      (a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt)
    );
    return reply.send({ kinds });
  });

  /** When each kind usually happens, over the last few weeks. */
  app.get("/routine/patterns", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const since = new Date(Date.now() - PATTERN_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await db
      .from("routine_items")
      .select("kind, kind_key, happened_at")
      .eq("household_id", caller.householdId)
      .gte("day", since)
      .order("happened_at", { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    const grouped = new Map<string, { kind: string; times: string[] }>();
    for (const r of data ?? []) {
      const g: { kind: string; times: string[] } = grouped.get(r.kind_key) ?? {
        kind: r.kind,
        times: [],
      };
      g.times.push(r.happened_at);
      grouped.set(r.kind_key, g);
    }
    const patterns: RoutinePatternDto[] = [...grouped.entries()]
      .map(([key, g]) => summarizePattern(g.kind, key, g.times, HOUSEHOLD_TZ))
      .filter((p) => p.count >= 2) // one occurrence is not a pattern
      .sort((a, b) => b.count - a.count);
    return reply.send({ days: PATTERN_DAYS, patterns });
  });

  app.post("/routine", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const parsed = CreateRoutineItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { day, kind, note, happenedAt } = parsed.data;

    const { count } = await db
      .from("routine_items")
      .select("*", { count: "exact", head: true })
      .eq("household_id", caller.householdId)
      .eq("day", day);
    if ((count ?? 0) >= MAX_ITEMS_PER_DAY)
      return reply.code(409).send({ error: `max ${MAX_ITEMS_PER_DAY} items per day` });

    const { data, error } = await db
      .from("routine_items")
      .insert({
        household_id: caller.householdId,
        day,
        kind: kind.trim(),
        kind_key: routineKindKey(kind),
        note: note?.trim() || null,
        happened_at: happenedAt,
        created_by: caller.userId,
      })
      .select("id, day, kind, kind_key, note, happened_at, created_by")
      .single();
    if (error || !data) return reply.code(500).send({ error: error?.message ?? "insert failed" });
    const names = await membersMap(caller.householdId);
    return reply.code(201).send(toDto(data as Row, names));
  });

  app.patch("/routine/:id", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const parsed = UpdateRoutineItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const patch: Record<string, unknown> = {};
    if (parsed.data.kind !== undefined) {
      patch.kind = parsed.data.kind.trim();
      patch.kind_key = routineKindKey(parsed.data.kind);
    }
    if (parsed.data.note !== undefined) patch.note = parsed.data.note?.trim() || null;
    if (parsed.data.happenedAt !== undefined) patch.happened_at = parsed.data.happenedAt;
    if (parsed.data.day !== undefined) patch.day = parsed.data.day;
    if (Object.keys(patch).length === 0) return reply.code(400).send({ error: "nothing to update" });

    const { data, error } = await db
      .from("routine_items")
      .update(patch)
      .eq("id", id)
      .eq("household_id", caller.householdId)
      .select("id, day, kind, kind_key, note, happened_at, created_by")
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!data) return reply.code(404).send({ error: "not found" });
    const names = await membersMap(caller.householdId);
    return reply.send(toDto(data as Row, names));
  });

  app.delete("/routine/:id", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const { error } = await db
      .from("routine_items")
      .delete()
      .eq("id", id)
      .eq("household_id", caller.householdId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });
}
