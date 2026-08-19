# RUNBOOK — wiring up & deploying The Biru Diaries

Follow these once, top to bottom (~30 minutes). You need free accounts on **Supabase**, **Railway**, and **Vercel**.

## 1. Supabase (database, auth, photos)

1. [supabase.com](https://supabase.com) → New project (any name, e.g. `biru`). Save the database password somewhere.
2. **SQL Editor** → paste & run each file from `supabase/migrations/`, in order:
   `0001_init.sql` → `0002_rls.sql` → `0003_storage.sql`. Each should say "Success".
3. **Authentication → Providers → Email**: make sure Email is enabled. For a smoother start, turn **OFF** "Confirm email" (you can turn it back on later) — otherwise you and Mei will need to click confirmation emails before first sign-in.
4. **Project Settings → API** → copy `Project URL` → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`.
5. **Project Settings → API Keys** — copy two values:
   - `publishable` key (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` *(browser-safe)*
   - `secret` key (`sb_secret_…`) → `SUPABASE_SECRET_KEY` *(secret — API only)*

   The API verifies access tokens against your project's JWKS
   (`https://YOUR-PROJECT.supabase.co/auth/v1/.well-known/jwks.json`) — set `SUPABASE_JWKS_URL`
   to override it, otherwise it's derived from `SUPABASE_URL`. No JWT secret needed.

## 2. Run it locally first (recommended)

```bash
cp apps/api/.env.example apps/api/.env        # fill in the Supabase URL + keys
cp apps/web/.env.example apps/web/.env.local  # fill in URL + publishable key; API URL stays http://localhost:8080
pnpm install && pnpm --filter @biru/shared build
pnpm dev:api      # terminal 1
pnpm dev:web      # terminal 2 → http://localhost:3000
```

Smoke test: sign up → onboarding ("who's in this story?") → create a diary entry with a photo → School tab → tick a lesson's boxes → gold star → Family tab → create an invite link → open it in a private browser window and join as a second account → confirm both accounts see the same diary.

## 3. Railway (the API)

1. [railway.app](https://railway.app) → New Project → **Deploy from GitHub repo** (push this repo to GitHub first) or `railway up` via CLI.
2. Service settings:
   - **Root directory:** `/` (monorepo — build from root)
   - **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @biru/shared build && pnpm --filter @biru/api build`
   - **Start command:** `node apps/api/dist/index.js`
3. **Variables:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `APP_ORIGIN=https://YOUR-APP.vercel.app` (add your Vercel domain after step 4; multiple origins comma-separated. `*.vercel.app` preview URLs are auto-allowed).
4. Networking → Generate domain. Check `https://<railway-domain>/healthz` returns `{"ok":true}`.

## 4. Vercel (the web app)

1. [vercel.com](https://vercel.com) → Add New Project → import the repo.
2. **Root directory:** `apps/web` (Vercel auto-detects Next.js; it handles the pnpm workspace).
3. **Environment variables:**
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_API_URL` = your Railway domain (`https://…railway.app`)
4. Deploy. Then go back to Railway and set `APP_ORIGIN` to the real Vercel URL.

## 5. Move in 🏡

1. Open the Vercel URL **on your phone** → sign up → onboarding (your name = Jerry, pup = Biru, his birthday).
2. iPhone: Share → **Add to Home Screen** — it installs like an app.
3. Family tab → create an invite link → text it to Mei → she joins on her phone.
4. Write the first page. (The empty-book screen will nudge you.)

## Troubleshooting

- **"missing bearer token" / instant sign-out** → web env vars missing or wrong; check `NEXT_PUBLIC_SUPABASE_*` in Vercel.
- **CORS error in the browser console** → `APP_ORIGIN` on Railway doesn't match the Vercel URL exactly (https, no trailing slash).
- **Photos fail to upload** → migration `0003_storage.sql` not run, or bucket `diary-photos` missing (Storage → check it exists).
- **"invalid token" from the API** → the API and web app point at different projects, or `SUPABASE_JWKS_URL` is wrong — it must be `<your SUPABASE_URL>/auth/v1/.well-known/jwks.json`. (Tokens are verified against Supabase's published JWT signing keys; legacy HS256 secrets are no longer used.)
- **Invite link says wandered off** → invites expire after 7 days or after one use; make a fresh one.

## What's deliberately not in v1

Email delivery of invites (links are copy/paste), photo-book PDF export (stubbed "soon"), push notification reminders, offline writes. All listed in the execution plan §10 — ask me when you want them.
