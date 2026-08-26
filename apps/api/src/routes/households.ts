import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import {
  CreateHouseholdSchema,
  UpdateHouseholdSchema,
  SignPhotoSchema,
  type HouseholdDto,
  type MemberDto,
} from "@biru/shared";
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
  let petPhotoUrl: string | null = null;
  if (h.pet_photo_path) {
    const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(h.pet_photo_path, SIGNED_URL_TTL);
    petPhotoUrl = data?.signedUrl ?? null;
  }
  return {
    id: h.id,
    name: h.name,
    species: h.species,
    petName: h.pet_name,
    petBreed: h.pet_breed,
    petBirthday: h.pet_birthday,
    petPhotoUrl,
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
        name: input.petName ? `${input.petName}'s family` : `${input.displayName}'s book`,
        species: input.species,
        pet_name: input.petName ?? null,
        pet_breed: input.petBreed ?? null,
        pet_birthday: input.petBirthday ?? null,
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
    const parsed = UpdateHouseholdSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.petName !== undefined) patch.pet_name = parsed.data.petName;
    if (parsed.data.species !== undefined) {
      // species is settable only while the household has no pet yet —
      // switching mid-curriculum would orphan course progress
      const { data: cur } = await db
        .from("households")
        .select("pet_name")
        .eq("id", caller.householdId)
        .single();
      if (cur?.pet_name) return reply.code(409).send({ error: "species can't change once the pet is set" });
      patch.species = parsed.data.species;
    }
    if (parsed.data.petBirthday !== undefined) patch.pet_birthday = parsed.data.petBirthday;
    if (parsed.data.petPhotoPath !== undefined) patch.pet_photo_path = parsed.data.petPhotoPath;
    // the pet's profile photo is a whole-family affair; everything else is owner-only
    const onlyPhoto = Object.keys(patch).every((k) => k === "pet_photo_path");
    if (!onlyPhoto && caller.role !== "owner")
      return reply.code(403).send({ error: "owner only" });
    // clean up the old profile photo when replacing it
    if (patch.pet_photo_path !== undefined) {
      const { data: current } = await db
        .from("households")
        .select("pet_photo_path")
        .eq("id", caller.householdId)
        .single();
      if (current?.pet_photo_path && current.pet_photo_path !== patch.pet_photo_path) {
        await db.storage.from(PHOTO_BUCKET).remove([current.pet_photo_path]);
      }
    }
    const { error } = await db.from("households").update(patch).eq("id", caller.householdId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send(await householdDto(caller.householdId));
  });

  // Signed direct-to-storage upload slot for the pet's profile photo (any member).
  app.post("/households/me/photo/sign", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const parsed = SignPhotoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const ext = parsed.data.contentType.split("/")[1].replace("jpeg", "jpg");
    const path = `${caller.householdId}/profile/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await db.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) return reply.code(500).send({ error: error?.message ?? "sign failed" });
    return reply.send({ path, uploadUrl: signed.signedUrl, token: signed.token });
  });
}
