# The Biru Diaries 🐶

A scrapbook-style web app for Jerry & Mei to (1) keep a shared photo diary of Biru the Biewer Terrier and (2) work through a built-in 12-week puppy-training course with checkbox progress.

**Stack:** Next.js (Vercel) · Fastify API (Railway) · Supabase (Postgres + Auth + Storage) · pnpm monorepo.

```
apps/web          Next.js app — the scrapbook UI (deploy → Vercel)
apps/api          Fastify API — business logic (deploy → Railway)
packages/shared   zod schemas, course manifest, rollup/streak logic (+ unit tests)
content/course    48 lessons of Biewer training content (12 weeks × 4 lessons, MDX)
supabase/         SQL migrations: schema, RLS, storage policies
design/           the approved clickable design mock (visual source of truth)
```

## Quick start (local dev)

```bash
pnpm install
pnpm manifest                      # compile course content → manifest (already committed)
pnpm --filter @biru/shared build   # build shared package

# 1. create a Supabase project, run the 3 files in supabase/migrations (SQL editor, in order)
# 2. configure env:
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
#    …fill in the values (see RUNBOOK.md)

pnpm dev:api    # Fastify on :8080
pnpm dev:web    # Next.js on :3000
```

Full setup + deploy instructions: **RUNBOOK.md**. Product/execution details: the execution plan in the project docs.

## Commands

| command | what |
|---|---|
| `pnpm manifest` | rebuild course manifest from `content/course` (validates slugs, task counts, biewer-tip callouts) |
| `pnpm typecheck` | typecheck all packages |
| `pnpm test` | unit tests (rollups, streak logic) |
| `pnpm build` | manifest + build everything |

## Editing course content

Lessons live in `content/course/week-NN/<slug>.mdx`. Edit the body freely; **never rename a file/slug or task id after real progress exists** (progress rows reference them). After editing run `pnpm manifest` and commit the regenerated `packages/shared/src/course-manifest.ts`.
