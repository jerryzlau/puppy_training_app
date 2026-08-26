import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import {
  CreateEntrySchema,
  UpdateEntrySchema,
  CreateCommentSchema,
  SignPhotoSchema,
  COURSE_MANIFESTS,
  allTaskIds,
  type EntryDto,
  type PhotoDto,
  type CommentDto,
  type MemberColor,
  type Species,
} from "@biru/shared";
import { requireMember, type Caller } from "../auth.js";
import { db, PHOTO_BUCKET, SIGNED_URL_TTL } from "../supabase.js";
import { friendHouseholdIds, areFriends } from "../friendships.js";

const MAX_PHOTOS = 5;
const PAGE_SIZE = 15;

// entries may pin lessons from either curriculum (dog and cat households share this API)
const LESSON_SLUGS = new Set(
  [COURSE_MANIFESTS.dog, COURSE_MANIFESTS.cat].flatMap((m) =>
    m.weeks.flatMap((w) => w.lessons.map((l) => l.slug))
  )
);
// touch allTaskIds so tree-shaking keeps shared logic wired (also used in progress route)
void allTaskIds;

interface MemberInfo {
  displayName: string;
  color: MemberColor;
}

async function membersMap(householdIds: string[]): Promise<Map<string, MemberInfo>> {
  if (householdIds.length === 0) return new Map();
  const { data } = await db
    .from("household_members")
    .select("user_id, display_name, color")
    .in("household_id", householdIds);
  // one household per user, so a flat map cannot collide
  return new Map((data ?? []).map((m) => [m.user_id, { displayName: m.display_name, color: m.color }]));
}

interface HouseholdBadge {
  petName: string;
  species: Species;
}

async function householdsBadgeMap(ids: string[]): Promise<Map<string, HouseholdBadge>> {
  if (ids.length === 0) return new Map();
  const { data } = await db.from("households").select("id, name, pet_name, species").in("id", ids);
  // petless households are labelled by their household name instead
  return new Map(
    (data ?? []).map((h) => [h.id, { petName: h.pet_name ?? h.name, species: h.species }])
  );
}

async function photosDto(entryIds: string[]): Promise<Map<string, PhotoDto[]>> {
  if (entryIds.length === 0) return new Map();
  const { data } = await db
    .from("entry_photos")
    .select("id, entry_id, storage_path, caption, position")
    .in("entry_id", entryIds)
    .order("position");
  const out = new Map<string, PhotoDto[]>();
  for (const p of data ?? []) {
    const { data: signed } = await db.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(p.storage_path, SIGNED_URL_TTL);
    const list = out.get(p.entry_id) ?? [];
    list.push({ id: p.id, url: signed?.signedUrl ?? "", caption: p.caption, position: p.position });
    out.set(p.entry_id, list);
  }
  return out;
}

function toDto(
  e: Record<string, any>,
  members: Map<string, MemberInfo>,
  photos: Map<string, PhotoDto[]>,
  badges?: Map<string, HouseholdBadge>,
  ownHouseholdId?: string
): EntryDto {
  const m = members.get(e.author_id);
  const badge =
    badges && ownHouseholdId && e.household_id !== ownHouseholdId
      ? badges.get(e.household_id)
      : undefined;
  return {
    ...(badge ? { household: { id: e.household_id, ...badge } } : {}),
    id: e.id,
    authorId: e.author_id,
    authorName: m?.displayName ?? "someone",
    authorColor: m?.color ?? "red",
    entryDate: e.entry_date,
    title: e.title,
    note: e.note,
    mood: e.mood,
    linkedLessonSlug: e.linked_lesson_slug,
    createdAt: e.created_at,
    photos: photos.get(e.id) ?? [],
  };
}

function validateLessonSlug(slug: string | null | undefined, reply: any): boolean {
  if (slug && !LESSON_SLUGS.has(slug)) {
    reply.code(400).send({ error: `unknown lesson slug: ${slug}` });
    return false;
  }
  return true;
}

/** An entry the caller may READ: their own household's, or a friended one's.
 *  Returns null for both "doesn't exist" and "not allowed" — no existence leak. */
async function loadReadableEntry(
  caller: Caller & { householdId: string },
  id: string
): Promise<{ entry: Record<string, any>; isFriend: boolean } | null> {
  const { data } = await db.from("diary_entries").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  if (data.household_id === caller.householdId) return { entry: data, isFriend: false };
  if (await areFriends(data.household_id, caller.householdId)) return { entry: data, isFriend: true };
  return null;
}

async function loadOwnEntry(caller: Caller & { householdId: string }, id: string) {
  const { data } = await db
    .from("diary_entries")
    .select("*")
    .eq("id", id)
    .eq("household_id", caller.householdId)
    .maybeSingle();
  return data;
}

export function entryRoutes(app: FastifyInstance) {
  app.get("/entries", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const q = req.query as { cursor?: string; month?: string; scope?: string };
    const friendsScope = q.scope === "friends";
    const householdIds = friendsScope
      ? [caller.householdId, ...(await friendHouseholdIds(caller.householdId))]
      : [caller.householdId];
    let query = db
      .from("diary_entries")
      .select("*")
      .in("household_id", householdIds)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!friendsScope && q.month && /^\d{4}-\d{2}$/.test(q.month)) {
      query = query.gte("entry_date", `${q.month}-01`).lt(
        "entry_date",
        // first day of next month
        new Date(Date.UTC(+q.month.slice(0, 4), +q.month.slice(5, 7), 1)).toISOString().slice(0, 10)
      );
    } else {
      query = query.limit(PAGE_SIZE + 1);
      if (q.cursor) {
        // cursor = "entryDate|createdAt"
        const [d, c] = q.cursor.split("|");
        query = query.or(`entry_date.lt.${d},and(entry_date.eq.${d},created_at.lt.${c})`);
      }
    }
    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: error.message });
    const rows = data ?? [];
    const monthMode = !friendsScope && Boolean(q.month);
    const page = monthMode ? rows : rows.slice(0, PAGE_SIZE);
    const members = await membersMap(householdIds);
    const photos = await photosDto(page.map((e) => e.id));
    const badges = friendsScope ? await householdsBadgeMap(householdIds) : undefined;
    const entries = page.map((e) => toDto(e, members, photos, badges, caller.householdId));
    const nextCursor =
      !monthMode && rows.length > PAGE_SIZE
        ? `${page[page.length - 1].entry_date}|${page[page.length - 1].created_at}`
        : null;
    return reply.send({ entries, nextCursor });
  });

  app.post("/entries", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const parsed = CreateEntrySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!validateLessonSlug(parsed.data.linkedLessonSlug, reply)) return;
    const { data, error } = await db
      .from("diary_entries")
      .insert({
        household_id: caller.householdId,
        author_id: caller.userId,
        entry_date: parsed.data.entryDate,
        title: parsed.data.title ?? null,
        note: parsed.data.note ?? null,
        mood: parsed.data.mood ?? null,
        linked_lesson_slug: parsed.data.linkedLessonSlug ?? null,
      })
      .select()
      .single();
    if (error || !data) return reply.code(500).send({ error: error?.message ?? "insert failed" });
    const members = await membersMap([caller.householdId]);
    return reply.code(201).send(toDto(data, members, new Map()));
  });

  app.get("/entries/:id", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const readable = await loadReadableEntry(caller, id);
    if (!readable) return reply.code(404).send({ error: "not found" });
    const { entry } = readable;
    const photos = await photosDto([id]);
    const { data: comments } = await db
      .from("entry_comments")
      .select("id, author_id, body, created_at")
      .eq("entry_id", id)
      .order("created_at");
    // Resolve ALL authors (entry + comments) directly by user id, not via
    // friendship — historical comments stay attributed after an unfriend.
    const authorIds = [entry.author_id, ...(comments ?? []).map((c) => c.author_id)];
    const { data: authorRows } = await db
      .from("household_members")
      .select("user_id, display_name, color, household_id")
      .in("user_id", authorIds);
    const members = new Map(
      (authorRows ?? []).map((m) => [m.user_id, { displayName: m.display_name, color: m.color }])
    );
    const authorHomes = new Map((authorRows ?? []).map((m) => [m.user_id, m.household_id]));
    // Badge every involved household. Attribution keys off the ENTRY's
    // household, not the caller's — filtering out the caller's own household
    // here would strip the label from their own cross-book comments.
    const involvedHomes = [...new Set([...authorHomes.values(), entry.household_id])];
    const badges = await householdsBadgeMap(involvedHomes as string[]);
    const dto = toDto(entry, members, photos, badges, caller.householdId);
    dto.comments = (comments ?? []).map((c): CommentDto => {
      const home = authorHomes.get(c.author_id);
      const foreign = home && home !== entry.household_id ? badges.get(home) : undefined;
      return {
        id: c.id,
        authorId: c.author_id,
        authorName: members.get(c.author_id)?.displayName ?? "someone",
        body: c.body,
        createdAt: c.created_at,
        ...(foreign && home ? { authorHousehold: { id: home, petName: foreign.petName } } : {}),
      };
    });
    return reply.send(dto);
  });

  app.patch("/entries/:id", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const entry = await loadOwnEntry(caller, id);
    if (!entry) return reply.code(404).send({ error: "not found" });
    if (entry.author_id !== caller.userId) return reply.code(403).send({ error: "author only" });
    const parsed = UpdateEntrySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!validateLessonSlug(parsed.data.linkedLessonSlug, reply)) return;
    const patch: Record<string, unknown> = {};
    if (parsed.data.entryDate !== undefined) patch.entry_date = parsed.data.entryDate;
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.note !== undefined) patch.note = parsed.data.note;
    if (parsed.data.mood !== undefined) patch.mood = parsed.data.mood;
    if (parsed.data.linkedLessonSlug !== undefined)
      patch.linked_lesson_slug = parsed.data.linkedLessonSlug;
    const { error } = await db.from("diary_entries").update(patch).eq("id", id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });

  app.delete("/entries/:id", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const entry = await loadOwnEntry(caller, id);
    if (!entry) return reply.code(404).send({ error: "not found" });
    if (entry.author_id !== caller.userId) return reply.code(403).send({ error: "author only" });
    // best-effort storage cleanup
    const { data: photos } = await db.from("entry_photos").select("storage_path").eq("entry_id", id);
    if (photos?.length) await db.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.storage_path));
    const { error } = await db.from("diary_entries").delete().eq("id", id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });

  // Signed direct-to-storage upload
  app.post("/entries/:id/photos/sign", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const entry = await loadOwnEntry(caller, id);
    if (!entry) return reply.code(404).send({ error: "not found" });
    const parsed = SignPhotoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { count } = await db
      .from("entry_photos")
      .select("*", { count: "exact", head: true })
      .eq("entry_id", id);
    if ((count ?? 0) >= MAX_PHOTOS)
      return reply.code(409).send({ error: `max ${MAX_PHOTOS} photos per entry` });
    const ext = parsed.data.contentType.split("/")[1].replace("jpeg", "jpg");
    const path = `${caller.householdId}/${id}/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await db.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) return reply.code(500).send({ error: error?.message ?? "sign failed" });
    // register the photo row now (client uploads immediately after)
    const { data: photo, error: pErr } = await db
      .from("entry_photos")
      .insert({ entry_id: id, storage_path: path, caption: parsed.data.caption ?? null, position: count ?? 0 })
      .select("id")
      .single();
    if (pErr || !photo) return reply.code(500).send({ error: pErr?.message ?? "photo row failed" });
    return reply.send({
      photoId: photo.id,
      path,
      uploadUrl: signed.signedUrl,
      token: signed.token,
    });
  });

  app.post("/entries/:id/comments", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const readable = await loadReadableEntry(caller, id);
    if (!readable) return reply.code(404).send({ error: "not found" });
    const parsed = CreateCommentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { data, error } = await db
      .from("entry_comments")
      .insert({ entry_id: id, author_id: caller.userId, body: parsed.data.body })
      .select("id, author_id, body, created_at")
      .single();
    if (error || !data) return reply.code(500).send({ error: error?.message ?? "insert failed" });
    let authorHousehold: { id: string; petName: string } | undefined;
    if (readable.isFriend) {
      const badges = await householdsBadgeMap([caller.householdId]);
      const own = badges.get(caller.householdId);
      if (own) authorHousehold = { id: caller.householdId, petName: own.petName };
    }
    return reply.code(201).send({
      id: data.id,
      authorId: data.author_id,
      authorName: caller.displayName ?? "someone",
      body: data.body,
      createdAt: data.created_at,
      ...(authorHousehold ? { authorHousehold } : {}),
    });
  });
}
