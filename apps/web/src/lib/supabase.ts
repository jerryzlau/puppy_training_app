"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "missing-key"
    );
  }
  return client;
}
