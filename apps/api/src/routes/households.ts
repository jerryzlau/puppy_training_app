import type { FastifyInstance } from "fastify";
import { CreateHouseholdSchema, UpdateHouseholdSchema, type HouseholdDto, type MemberDto } from "@biru/shared";
import { authenticate, requireMember } from "../auth.js";
import { db, PHOTO_BUCKET, SIGNED_URL_TTL } from "../supabase.js";

async function householdDto(householdId: string): Promise<HouseholdDto | null> {
  const { data: h } = await db.from("households").select("*").eq("id", householdId).maybeSingle();
  if (!h) return null;
  const { data: members } = await db
    .from("household_members")
    .select("user_id, display_name, role, color, joined_at")
    .eq("household_id", householdId)
    .order("joined_at");
  let dogPhotoUrl: string | null = null;
  if (h.dog_photo_path) {
    const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(h.dog_photo_path, SIGNED_URL_TTL);
    dogPhotoUrl = data?.signedUrl ?? null;
  }
  return {
    id: h.id,
    name: h.name,
    dogName: h.dog_name,
    dogBreed: h.dog_breed,
    dogBirthday: h.dog_birthday,
    dogPhotoUrl,
    createdAt: h.created_at,
    members: (members ?? []).map(
      (m): MemberDto => ({
        userId: m.user_id,
        displayName: m.display_name,
        role: m.role,
        color: m.color,
        joinedAt: m.joined_at,
      })
    ),
  };
}

export function householdRoutes(app: FastifyInstance) {
  app.post("/households", async (req, reply) => {
    const caller = await authenticate(req, reply);
    if (!caller) return;
    if (caller.householdId) return reply.code(409).send({ error: "already in a household" });
    const parsed = CreateHouseholdSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const input = parsed.data;

    const { data: household, error } = await db
      .from("households")
      .insert({
        name: `${input.dogName}'s family`,
        dog_name: input.dogName,
        dog_breed: input.dogBreed,
        dog_birthday: input.dogBirthday ?? null,
        created_by: caller.userId,
      })
      .select()
      .single();
    if (error || !household) return reply.code(500).send({ error: error?.message ?? "insert failed" });

    const { error: mErr } = await db.from("household_members").insert({
      household_id: household.id,
      user_id: caller.userId,
      display_name: input.displayName,
      role: "owner",
      color: "red",
    });
    if (mErr) return reply.code(500).send({ error: mErr.message });
    return reply.code(201).send(await householdDto(household.id));
  });

  app.get("/households/me", async (req, reply) => {
    const caller = await authenticate(req, reply);
    if (!caller) return;
    if (!caller.householdId) return reply.send(null);
    return reply.send(await householdDto(caller.householdId));
  });

  app.patch("/households/me", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    if (caller.role !== "owner") return reply.code(403).send({ error: "owner only" });
    const parsed = UpdateHouseholdSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.dogName !== undefined) patch.dog_name = parsed.data.dogName;
    if (parsed.data.dogBirthday !== undefined) patch.dog_birthday = parsed.data.dogBirthday;
    if (parsed.data.dogPhotoPath !== undefined) patch.dog_photo_path = parsed.data.dogPhotoPath;
    const { error } = await db.from("households").update(patch).eq("id", caller.householdId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(await householdDto(caller.householdId));
  });
}
