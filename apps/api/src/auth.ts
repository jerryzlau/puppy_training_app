import type { FastifyRequest, FastifyReply } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env.js";
import { db } from "./supabase.js";
import type { MemberColor } from "@biru/shared";

export interface Caller {
  userId: string;
  email: string;
  /** null until the user has created/joined a household */
  householdId: string | null;
  displayName: string | null;
  role: "owner" | "member" | null;
  color: MemberColor | null;
}

/** Supabase signs access tokens with asymmetric keys; cached + auto-rotated by jose. */
const jwks = createRemoteJWKSet(new URL(env.jwksUrl));

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<Caller | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing bearer token" });
    return null;
  }
  let payload: { sub?: string; email?: string };
  try {
    const verified = await jwtVerify(header.slice(7), jwks, {
      issuer: `${env.supabaseUrl}/auth/v1`,
      audience: "authenticated",
    });
    payload = verified.payload as typeof payload;
  } catch {
    reply.code(401).send({ error: "invalid token" });
    return null;
  }
  if (!payload.sub) {
    reply.code(401).send({ error: "invalid token payload" });
    return null;
  }
  const { data: membership } = await db
    .from("household_members")
    .select("household_id, display_name, role, color")
    .eq("user_id", payload.sub)
    .maybeSingle();

  return {
    userId: payload.sub,
    email: payload.email ?? "",
    householdId: membership?.household_id ?? null,
    displayName: membership?.display_name ?? null,
    role: (membership?.role as "owner" | "member" | undefined) ?? null,
    color: (membership?.color as MemberColor | undefined) ?? null,
  };
}

/** Like authenticate, but 403s when the caller has no household yet. */
export async function requireMember(req: FastifyRequest, reply: FastifyReply): Promise<(Caller & { householdId: string }) | null> {
  const caller = await authenticate(req, reply);
  if (!caller) return null;
  if (!caller.householdId) {
    reply.code(403).send({ error: "no household — complete onboarding first" });
    return null;
  }
  return caller as Caller & { householdId: string };
}
