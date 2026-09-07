# CaribClear 🌊🚢

**Multi-tenant SaaS for foreign trade operations** — customs brokers, freight forwarders and SME importers in Trinidad & Tobago and the Caribbean.

Shipments tracking · 5-year document vault · landed-cost engine (CET / VAT 12.5% / Motor Vehicle Tax) · T&T permits matrix · importer client portal · immutable audit trail.

> Built for the TradeTech blue ocean: hundreds of brokers and thousands of importers still run on Excel, WhatsApp and email. State modernization (Port Community System 2023, ASYCUDA World upgrades) makes now the moment.

---

## Feature map (MVP — all shipped)

| Module | Where | Highlights |
|---|---|---|
| Guided onboarding + tenant registration | `/register` → `/dashboard` | Setup checklist, instant Free tenant |
| KPI dashboard | `/dashboard` | In-transit count, alerts, demurrage risk, cost totals, pipeline chart (Recharts), checklist |
| Shipments & tracking | `/dashboard/shipments` | Sea/air, **7-state visual timeline** (order → sailed → in transit → arrived → discharged → in customs → released), containers, ETA, **demurrage countdown with penalty accrual** |
| Document vault | `/dashboard/documents` | Versioning (new version supersedes), expiry alerts, 10MB uploads, retention aligned with **Customs Act Cap 78:01 (5 years)** |
| **Landed cost engine** | `/dashboard/calculator` + `src/lib/engine/landed-cost.ts` | Pure TS, deterministic: CIF → CET duty → **MVT per-cc brackets (foreign-used 75%)** → VAT 12.5% (base incl. MVT per VAT Act Sched. 2(8)(4)) → 2026 customs fees → tyre/plastics/online taxes. Line-by-line TTD breakdown, half-up 2-dec rounding |
| HS/CET search | `/dashboard/hs-codes` | 41 seeded tariff lines (real 2026 rates), favorites, history, saved product rates |
| T&T permits matrix | `/dashboard/permits` | CFO/agro, TTBS, EMA-CEC, Drug Inspectorate, Pesticides Board, used-vehicle inspection — with TTBizLink links + per-shipment checklists |
| Importer portal | `/portal` | Clients see ONLY their own shipments/docs/costs (clientId scoping) and **approve quotes in one click** |
| Quotes & invoices | `/dashboard/quotes` | Fees (VAT 12.5%) + disbursements (no VAT) + total; draft → sent → approved/paid |
| Plans Free/Pro | `/dashboard/settings` + `/admin` | Feature-flag based, instant upgrade, no data migration |
| Super admin console | `/admin` | Tenants, plans, suspension, platform stats |
| Notifications | bell icon + `/api/notifications` | Demurrage ≤3 days, ETA overdue, docs expiring ≤30 days (idempotent scan); WhatsApp/email adapters stubbed behind interface |
| Compliance | everywhere | Hash-chained append-only audit log (jsonb-proof canonical hashing), 2FA TOTP + backup codes + progressive lockout, security headers + CSP, rate limiting |

## Legal compliance by design

- **Tool, not agent**: disclaimers everywhere — legal responsibility before T&T Customs stays with the licensed broker of record.
- **Never hardcode laws**: every rate lives in the `RateConfig` versioned table (value JSON + `effectiveFrom` + version). The engine reads a snapshot; historical calcs keep what was used.
- **GDPR-lite**: one-click JSON data export, deletion path, single strictly-necessary session cookie, DPA-ready for Jamaica/Barbados clients.
- **Data residency**: Postgres in AWS us-east-1 via Supabase is valid under T&T's partially-proclaimed DPA 2011; IaC/standard Postgres keeps you portable if residency rules change.

## Architecture

```
Next.js 16 (App Router, TS strict) ── Tailwind 4 + shadcn/ui
        │
        ├── src/lib/engine/landed-cost.ts   ← pure, tested math (no DB, no IO)
        ├── src/lib/{session,guard,audit}.ts← JWT session, tenant/role guards, WORM audit
        ├── src/app/api/**                  ← route handlers (Zod-style validation)
        └── prisma/schema.prisma            ← 18 models, tenant_id everywhere
                │
     [dev] SQLite (file:db/custom.db)
     [prod] Supabase Postgres + RLS (supabase/rls-setup.sql) + Storage + pg_cron
```

**Isolation is two-layered**: the app layer guards every query (`requireTenant`, `assertTenantOwns`) AND `supabase/rls-setup.sql` enforces default-deny row-level security keyed on the JWT `app_metadata.tenant_id` claim — including an UPDATE/DELETE-blocking trigger on `AuditLog` (append-only, court-grade).

## Quick start (dev)

```bash
bun install                     # or npm install
bun run db:push                 # create SQLite db from schema
bun run dev                     # http://localhost:3000
```

Seed the demo dataset (broker + 3 users + importer portal user + super admin + 5 shipments in different states + docs + permits + cost calcs + quotes + notifications):

```bash
curl -X POST http://localhost:3000/api/demo/seed    # JSON
# or open http://localhost:3000/api/demo/seed and click "Go to Login"
```

**Demo credentials** (after seeding):

| Role | Email | Password |
|---|---|---|
| Broker admin | `admin@caribbeanfreight.demo` | `Demo2026!` |
| Operator | `operator@caribbeanfreight.demo` | `Demo2026!` |
| Importer (portal) | `importer@demo.tt` | `Demo2026!` |
| Platform super admin | `super@caribclear.dev` | `Super2026!` |

## Tests

```bash
bun tests/engine.test.ts        # 42 assertions: vehicles by cc, foreign-used 75%,
                                # VAT base incl. MVT, exempt lines, fees 2026,
                                # FX, rounding, determinism, zero/LCL edge cases
```

Acceptance criterion "≥20 unit tests with real cases (used vehicle 1500cc, CFO food item, exempt spare parts…)" — exceeded.

## Production deploy (Vercel + Neon Postgres) — LIVE

1. **Neon**: project created (us-east-1). Two connection strings matter:
   - **Runtime (app)**: the **pooled** `-pooler` host with `?sslmode=require&pgbouncer=true&connection_limit=5` → `DATABASE_URL` in Vercel.
   - **Migrations**: the **direct** host (no `-pooler`) → used only by `prisma db push` / `migrate`.
2. **Schema**: already on PostgreSQL (`prisma/schema.prisma`). Roll back to local SQLite dev anytime with `npm run db:sqlite`; re-switch with `npm run db:pg`.

```bash
DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" npx prisma db push   # migrations use the DIRECT host
```

3. **Vercel** env vars:

```env
DATABASE_URL=postgresql://USER:PASS@ep-xxx-pooler...neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5
JWT_SECRET=<64 hex chars: openssl rand -hex 32>
VAULT_ENCRYPTION_KEY=<64 hex chars: openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=https://caribclear.vercel.app
VAPID_PUBLIC_KEY=<npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<same pair>
VAPID_SUBJECT=mailto:platform@caribclear.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public key>
```

4. **Seed demo data** on the live site (idempotent — safe to re-run):

```bash
curl -X POST https://your-app.vercel.app/api/demo/seed
```

5. **Crons** (optional): `vercel.json` schedule → `/api/cron/retention`, `/api/cron/sla-escalation` (extend to email/WhatsApp by filling the adapters in `src/lib/notify.ts`).
6. **RLS hardening (optional)**: `supabase/rls-setup.sql` is Supabase-flavored (JWT claims). On Neon, tenant isolation is enforced in the data layer + WORM hash-chain; the `verifyChain` endpoint in Tower → Health proves it live.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres (prod) / file:db/custom.db (dev) |
| `VAULT_ENCRYPTION_KEY` | ✅ prod | AES-256-GCM key for document-vault encryption at rest (dev fallback exists; set before storing real documents) |
| `JWT_SECRET` | ✅ prod | Session signing + TOTP secret encryption (fallback: `WHISTLE_ENCRYPTION_KEY`) |
| `NEXT_PUBLIC_APP_URL` | — | Absolute URL for links/emails |

## Out of MVP scope (phase 2, already planned)

Direct ASYCUDA/PCS XML export · AI document OCR · advanced analytics · logistics marketplace · RegTech for credit unions · real payment rails (Stripe + WiPay/PayWise behind `plan` abstraction).

---

*CaribClear is a software tool, not a licensed customs agent. Reference rates are versioned legal schedules — confirm the current Legal Notice before filing.*
