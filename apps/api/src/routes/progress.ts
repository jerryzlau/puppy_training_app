import type { FastifyInstance } from "fastify";
import {
  COURSE_MANIFESTS,
  allTaskIds,
  courseRollup,
  streakDays,
  earnedBadges,
  HOUSEHOLD_TZ,
  type ProgressStatsDto,
  type Species,
} from "@biru/shared";
import { requireMember } from "../auth.js";
import { db } from "../supabase.js";

// A task id is valid if it belongs to either curriculum; which one applies to
// the caller is decided by their household's species at read time.
const VALID_TASKS = new Set<string>([
  ...allTaskIds(COURSE_MANIFESTS.dog),
  ...allTaskIds(COURSE_MANIFESTS.cat),
]);

async function householdSpecies(householdId: string): Promise<Species> {
  const { data } = await db.from("households").select("species").eq("id", householdId).maybeSingle();
  return (data?.species as Species) ?? "dog";
}

export function progressRoutes(app: FastifyInstance) {
  app.get("/progress", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { data, error } = await db
      .from("course_progress")
      .select("task_id, checked_by, checked_at")
      .eq("household_id", caller.householdId);
    if (error) return reply.code(500).send({ error: error.message });
    const { data: members } = await db
      .from("household_members")
      .select("user_id, display_name")
      .eq("household_id", caller.householdId);
    const names = new Map((members ?? []).map((m) => [m.user_id, m.display_name]));
    const checks = (data ?? []).map((r) => ({
      taskId: r.task_id,
      checkedBy: r.checked_by,
      checkedByName: names.get(r.checked_by) ?? "someone",
      checkedAt: r.checked_at,
    }));
    const species = await householdSpecies(caller.householdId);
    const rollup = courseRollup(COURSE_MANIFESTS[species], new Set(checks.map((c) => c.taskId)));
    return reply.send({ checks, rollup });
  });

  app.put("/progress/:taskId(.*)", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const taskId = decodeURIComponent((req.params as { taskId: string }).taskId);
    if (!VALID_TASKS.has(taskId)) return reply.code(400).send({ error: `unknown task: ${taskId}` });
    const { error } = await db
      .from("course_progress")
      .upsert(
        { household_id: caller.householdId, task_id: taskId, checked_by: caller.userId },
        { onConflict: "household_id,task_id", ignoreDuplicates: true }
      );
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });

  app.delete("/progress/:taskId(.*)", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const taskId = decodeURIComponent((req.params as { taskId: string }).taskId);
    const { error } = await db
      .from("course_progress")
      .delete()
      .eq("household_id", caller.householdId)
      .eq("task_id", taskId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });

  app.get("/progress/stats", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const [{ data: checks }, { data: members }, { data: entryDates }, species] = await Promise.all([
      db
        .from("course_progress")
        .select("task_id, checked_by, checked_at")
        .eq("household_id", caller.householdId),
      db
        .from("household_members")
        .select("user_id, display_name, color")
        .eq("household_id", caller.householdId),
      db
        .from("diary_entries")
        .select("created_at")
        .eq("household_id", caller.householdId)
        .order("created_at", { ascending: false })
        .limit(400),
      householdSpecies(caller.householdId),
    ]);
    const manifest = COURSE_MANIFESTS[species];
    const checkedSet = new Set((checks ?? []).map((c) => c.task_id));
    const rollup = courseRollup(manifest, checkedSet);
    const activity = [
      ...(checks ?? []).map((c) => new Date(c.checked_at)),
      ...(entryDates ?? []).map((e) => new Date(e.created_at)),
    ];
    const perMember = (members ?? []).map((m) => ({
      userId: m.user_id,
      displayName: m.display_name,
      color: m.color,
      count: (checks ?? []).filter((c) => c.checked_by === m.user_id).length,
    }));
    const stats: ProgressStatsDto = {
      totalTasks: rollup.totalTasks,
      checkedTasks: rollup.checkedTasks,
      percent: rollup.percent,
      lessonsDone: rollup.lessonsDone,
      totalLessons: rollup.totalLessons,
      weeksDone: rollup.weeksDone,
      currentWeek: rollup.currentWeek,
      streakDays: streakDays(activity, HOUSEHOLD_TZ),
      perMember,
    };
    return reply.send({
      ...stats,
      badges: earnedBadges(manifest, checkedSet).map((b) => b.label),
    });
  });
}
