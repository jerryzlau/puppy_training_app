import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/** Service-role client: bypasses RLS. Every query below MUST be scoped by household. */
export const db = createClient(env.supabaseUrl, env.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const PHOTO_BUCKET = "diary-photos";
export const SIGNED_URL_TTL = 60 * 60; // 1h read URLs
