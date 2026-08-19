const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return v;
};

const supabaseUrl = required("SUPABASE_URL");

export const env = {
  supabaseUrl,
  /** `sb_secret_…` API key: bypasses RLS. Never ship to a browser. */
  secretKey: required("SUPABASE_SECRET_KEY"),
  /** Asymmetric JWT signing keys — access tokens are verified against this JWKS. */
  jwksUrl: process.env.SUPABASE_JWKS_URL ?? `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
  appOrigins: (process.env.APP_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  port: parseInt(process.env.PORT ?? "8080", 10),
};
