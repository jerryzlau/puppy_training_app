import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { CreateInviteSchema } from "@biru/shared";
import { authenticate, requireMember } from "../auth.js";
import { db } from "../supabase.js";

const MAX_MEMBERS = 6;
const INVITE_TTL_DAYS = 7;
const MEMBER_COLORS = ["blue", "green", "brown"] as const;

export function inviteRoutes(app: FastifyInstance) {
  app.post("/invites", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const parsed = CreateInviteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const token = crypto.randomBytes(24).toString("base64url");
    const { data, error } = await db
      .from("invites")
      .insert({
        household_id: caller.householdId,
        email: parsed.data.email.toLowerCase(),
        token,
        created_by: caller.userId,
        expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
      })
      .select("id, email, token, status, expires_at, created_at")
      .single();
    if (error || !data) return reply.code(500).send({ error: error?.message ?? "insert failed" });
    return reply.code(201).send(data);
  });

  app.get("/invites", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { data } = await db
      .from("invites")
      .select("id, email, status, expires_at, created_at, token")
      .eq("household_id", caller.householdId)
      .order("created_at", { ascending: false });
    return reply.send(data ?? []);
  });

  // Public preview: who invited me, to what?
  app.get("/invites/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const { data: invite } = await db
      .from("invites")
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
      petName: h?.pet_name,
      petBreed: h?.pet_breed,
      invitedBy: owner?.display_name ?? "someone",
    });
  });

  app.post("/invites/:token/accept", async (req, reply) => {
    const caller = await authenticate(req, reply);
    if (!caller) return;
    if (caller.householdId) return reply.code(409).send({ error: "already in a household" });
    const { token } = req.params as { token: string };
    const body = (req.body ?? {}) as { displayName?: string };
    const displayName = (body.displayName ?? "").trim() || caller.email.split("@")[0];

    const { data: invite } = await db
      .from("invites")
      .select("id, household_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (!invite || invite.status !== "pending" || new Date(invite.expires_at) < new Date()) {
      return reply.code(404).send({ error: "invite not found or expired" });
    }
    const { count } = await db
      .from("household_members")
      .select("*", { count: "exact", head: true })
      .eq("household_id", invite.household_id);
    if ((count ?? 0) >= MAX_MEMBERS) return reply.code(409).send({ error: "household is full" });

    const color = MEMBER_COLORS[(count ?? 1) % MEMBER_COLORS.length];
    const { error: mErr } = await db.from("household_members").insert({
      household_id: invite.household_id,
      user_id: caller.userId,
      display_name: displayName,
      role: "member",
      color,
    });
    if (mErr) return reply.code(500).send({ error: mErr.message });
    await db.from("invites").update({ status: "accepted" }).eq("id", invite.id);
    return reply.send({ ok: true, householdId: invite.household_id });
  });

  app.delete("/invites/:id", async (req, reply) => {
    const caller = await requireMember(req, reply);
    if (!caller) return;
    const { id } = req.params as { id: string };
    const { error } = await db
      .from("invites")
      .update({ status: "revoked" })
      .eq("id", id)
      .eq("household_id", caller.householdId);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });
}
