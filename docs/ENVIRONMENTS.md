# CaribClear — Environments & Release Protocol

How the code travels from a developer's machine to paying customers.
Written for a solo operator: minimal moving parts, every step verifiable.

## Current topology (what actually exists)

| Environment | Where | Branch | Database | Who uses it |
|---|---|---|---|---|
| Production | Vercel (`caribclear.vercel.app`) | `main` | Production Postgres (Supabase/Neon — see Vercel env `DATABASE_URL`) | Real tenants |
| Staging / Preview | Vercel Preview URLs (one per branch/PR) | `staging` | **You must attach a separate database** (Neon branch or a second Supabase project) | You + test tenants |
| Local | `npm run dev` | any | SQLite (`db:sqlite`) or local Postgres | Development |

CI (GitHub Actions, `.github/workflows/ci.yml`) runs on every push and PR to
`main`/`staging`: typecheck, lint, the 10 test suites against a **real
Postgres 16** service, and a production build. Nothing merges without a
green run.

## One-time setup (15 minutes, do it once)

1. **Branch protection (already applied via API when this shipped; re-do if removed):**
   - `main` and `staging`: force-push **disabled**, deletion **disabled**.
   - Optional hardening when you want PR review: enable "Require status checks → ci".
2. **Staging database (free tier is enough):**
   - Neon: create project → `main` branch = prod mirror → add branch `staging`.
     (Or a second Supabase project. The point: staging data is disposable and
     NEVER shared with production.)
   - Copy its connection string.
3. **Vercel:**
   - Vercel automatically builds every branch; `main` produces Production,
     other branches produce Preview URLs.
   - In the Vercel project → Settings → Environment Variables: scope
     `DATABASE_URL` for **Production** = production DB; add a **Preview**
     scoped `DATABASE_URL` = staging DB. Add the same for `AUTH_SECRET`,
     vault key and the payment gateway vars if configured.
   - Optional: Settings → Domains → add `staging.caribclear.vercel.app`-style
     alias pinned to the `staging` branch (or just use the generated preview URL).
4. **Cron secret:** set `CRON_SECRET` in Vercel (Production + Preview). The
   two crons in `vercel.json` (`/api/cron/sla-escalation`, `/api/cron/retention`)
   verify `Authorization: Bearer $CRON_SECRET` and 401 on mismatch.

## Release checklist (every deploy to production)

1. Commit/push to `staging` first when the change is risky (schema, billing,
   auth). Watch the CI run AND click the Vercel preview URL that appears.
2. Smoke the preview: register a test tenant, run one calculation, open the
   dashboard pages you touched.
3. Schema changes: run `npx prisma db push` against the PRODUCTION
   `DATABASE_URL` **before** or in the same deploy (additive columns/tables
   are safe; destructive changes need the data plan documented below).
4. Merge/push `main`. Vercel deploys production. Verify:
   - `/api/health` returns ok.
   - The pricing page shows the current lineup.
   - `GET /api/cron/retention` (with the bearer) answers — proves crons exist.
5. Rollback = Vercel → Deployments → previous deployment → **Promote**.
   (Schema rollbacks: never assume — additive-first design keeps old code
   working against new tables.)

## Data plan rules (schema discipline)

- **Additive first**: new columns are nullable or defaulted; new tables are
  independent. Old code runs against the new schema.
- **Destructive changes** (drop column, tighten types): two-phase. Ship the
  code that stops using the column, wait one release cycle, then push the
  schema drop.
- **Seed parity**: any new demo data goes through `/api/demo/seed` so staging
  and demo tenants look alike.

## Test database notes

- `tests/isolation.test.ts` needs a REAL Postgres (CI provides one; locally
  set `DATABASE_URL` to any disposable Postgres and run
  `npx prisma db push` first). It creates its own `iso-a-*`/`iso-b-*` tenants
  and deletes them afterwards.
- The three `prisma/schema*.prisma` files must stay in sync
  (`schema.prisma` = canonical postgres; `schema.postgres.prisma` =
  prod-variant defaults; `schema.sqlite.backup.prisma` = local SQLite dev).
  CI typechecks against the canonical one.
