import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import type { FriendDto, FriendInviteDto, Species } from "@biru/shared";
import { requireMember } from "../auth.js";
import { db, PHOTO_BUCKET, SIGNED_URL_TTL } from "../supabase.js";
import { friendHouseholdIds, canonicalPair, areFriends } from "../friendships.js";

const INVITE_TTL_DAYS = 7;
const MAX_FRIENDS = 20;

interface InviteRow {
  id: string;
  household_id: string;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
}

const toInviteDto = (r: InviteRow): FriendInviteDto => ({
  id: r.id,
  token: r.token,
  status: r.status as FriendInviteDto["status"],
  expiresAt: r.expires_at,
  createdAt: r.created_at,
});

async function friendDto(
  householdId: string,
  since: string,
  viaMyLink = false
): Promise<FriendDto | null> {
  const { data: h } = await db
    .from("households")
    .select("id, name, species, pet_name, pet_breed, pet_photo_path")
    .eq("id", householdId)
    .maybeSingle();
  if (!h) return null;
  const { data: owner } = await db
    .from("household_members")
    .select("display_name")
    .eq("household_id", householdId)
    .eq("role", "owner")
    .maybeSingle();
  let petPhotoUrl: string | null = null;
  if (h.pet_photo_path) {
    const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(h.pet_photo_path, SIGNED_URL_TTL);
    petPhotoUrl = data?.signedUrl ?? null;
  }
  return {
    householdId: h.id,
    name: h.name,
    petName: h.pet_name ?? h.name,
    species: h.species as Species,
    petBreed: h.pet_breed,
    petPhotoUrl,
    ownerName: owner?.display_name ?? "someone",
    viaMyLink,
    since,
  };
}

export function friendRoutes(app: FastifyInstance) {
  app.post("/friend-invites", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const token = crypto.randomBytes(24).toString("base64url");
    const { data, error } = await db
      .from("friend_invites")
      .insert({
        household_id: caller.householdId,
        token,
        created_by: caller.userId,
        expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
      })
      .select("id, household_id, token, status, expires_at, created_at")
      .single();
    if (error || !data) return reply.code(500).send({ error: error?.message ?? "insert failed" });
    return reply.code(201).send(toInviteDto(data as InviteRow));
  });

  app.get("/friend-invites", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { data } = await db
      .from("friend_invites")
      .select("id, household_id, token, status, expires_at, created_at")
      .eq("household_id", caller.householdId)
      .order("created_at", { ascending: false });
    return reply.send({ invites: ((data ?? []) as InviteRow[]).map(toInviteDto) });
  });

  /** Public preview: whose book wants to link with mine? */
  app.get("/friend-invites/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const { data: invite } = await db
      .from("friend_invites")
      .select("id, household_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (!invite || invite.status !== "pending" || new Date(invite.expires_at) < new Date()) {
      return reply.code(404).send({ error: "invite not found or expired" });
    }
    const { data: h } = await db
      .from("households")
      .select("name, species, pet_name, pet_breed")
      .eq("id", invite.household_id)
      .single();
    const { data: owner } = await db
      .from("household_members")
      .select("display_name")
      .eq("household_id", invite.household_id)
      .eq("role", "owner")
      .maybeSingle();
    return reply.send({
      householdName: h?.name,
      species: h?.species ?? "dog",
      petName: h?.pet_name ?? h?.name,
      petBreed: h?.pet_breed,
      invitedBy: owner?.display_name ?? "someone",
    });
  });

  /** Accept: the caller must already HAVE a household — the opposite
   *  precondition of a partner invite. */
  app.post("/friend-invites/:token/accept", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { token } = req.params as { token: string };
    const { data: invite } = await db
      .from("friend_invites")
      .select("id, household_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (!invite || invite.status !== "pending" || new Date(invite.expires_at) < new Date()) {
      return reply.code(404).send({ error: "invite not found or expired" });
    }
    if (invite.household_id === caller.householdId) {
      return reply.code(409).send({ error: "that's your own book" });
    }
    if (await areFriends(invite.household_id, caller.householdId)) {
      return reply.code(409).send({ error: "already friends" });
    }
    const existing = await friendHouseholdIds(caller.householdId);
    if (existing.length >= MAX_FRIENDS) {
      return reply.code(409).send({ error: `max ${MAX_FRIENDS} friend books` });
    }
    const { a, b } = canonicalPair(invite.household_id, caller.householdId);
    const { error: fErr } = await db
      .from("household_friends")
      .insert({ household_a: a, household_b: b });
    if (fErr) {
      // unique violation = both sides accepted concurrently; treat as already-friends
      if (fErr.code === "23505") return reply.code(409).send({ error: "already friends" });
      return reply.code(500).send({ error: fErr.message });
    }
    // single-use under race: only flips if still pending
    await db
      .from("friend_invites")
      .update({ status: "accepted", accepted_household_id: caller.householdId })
      .eq("id", invite.id)
      .eq("status", "pending");
    const friend = await friendDto(invite.household_id, new Date().toISOString(), false);
    return reply.send({ ok: true, friend });
  });

  app.delete("/friend-invites/:id", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const { error } = await db
      .from("friend_invites")
      .update({ status: "revoked" })
      .eq("id", id)
      .eq("household_id", caller.householdId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });

  app.get("/friends", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { data } = await db
      .from("household_friends")
      .select("household_a, household_b, created_at")
      .or(`household_a.eq.${caller.householdId},household_b.eq.${caller.householdId}`)
      .order("created_at", { ascending: true });
    const others = (data ?? []).map((r) =>
      r.household_a === caller.householdId ? r.household_b : r.household_a
    );
    // households that accepted a link WE created
    const { data: myInvites } = await db
      .from("friend_invites")
      .select("accepted_household_id")
      .eq("household_id", caller.householdId)
      .eq("status", "accepted")
      .in("accepted_household_id", others.length ? others : ["00000000-0000-0000-0000-000000000000"]);
    const viaMine = new Set((myInvites ?? []).map((i) => i.accepted_household_id));
    const friends: FriendDto[] = [];
    for (const r of data ?? []) {
      const other = r.household_a === caller.householdId ? r.household_b : r.household_a;
      const dto = await friendDto(other, r.created_at, viaMine.has(other));
      if (dto) friends.push(dto);
    }
    return reply.send({ friends });
  });

  /** Unfriend: one symmetric row, so this revokes access both ways at once. */
  app.delete("/friends/:householdId", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { householdId } = req.params as { householdId: string };
    const { a, b } = canonicalPair(caller.householdId, householdId);
    const { data, error } = await db
      .from("household_friends")
      .delete()
      .eq("household_a", a)
      .eq("household_b", b)
      .select("household_a");
    if (error) return reply.code(500).send({ error: error.message });
    if (!data?.length) return reply.code(404).send({ error: "not friends" });
    return reply.send({ ok: true });
  });
}
