# Load testing — CaribClear

k6 scripts for the landed-cost API. **Run these against staging/preview, never
against production with real tenants on the box.**

## Install

```bash
# macOS: brew install k6   |   Debian/Ubuntu: see grafana.com/tutorials/k6-get-started
```

## Smoke (post-deploy sanity — 20 VU, 60 s)

```bash
BASE=https://<your-preview>.vercel.app \
EMAIL=<seeded staff email> PASSWORD=<password> \
k6 run load/k6-landed-cost.js
```

## Stress (find the ceiling — ramps to 500 VU)

```bash
PROFILE=stress BASE=https://<your-preview>.vercel.app \
EMAIL=... PASSWORD=... \
k6 run load/k6-landed-cost.js
```

## What the script does

- `GET /api/billing/plans` and `GET /api/health` — cheap edge traffic.
- `POST /api/costs?preview=1` — the full TT landed-cost engine. **Preview on
  purpose**: nothing persists, no plan quota consumed, no audit rows — a load
  run cannot corrupt tenant data.
- SLOs enforced as k6 thresholds (the run FAILS if breached):
  - smoke: error rate < 1%, p95 < 500 ms
  - stress: error rate < 5%, p95 < 2000 ms

## What to watch while it runs

| Layer | Where | Red flag |
|---|---|---|
| Vercel | Dashboard → Functions | duration spikes, memory limit kills |
| Postgres (Supabase/Neon) | CPU / IO dashboard | CPU pegged, connection pool exhaustion (`too many connections`) |
| Rate limiter | `429` in results | app-level limiter triggering is EXPECTED on stress |

## Honest limits

- These numbers mean "this environment holds X VUs for the calculator path".
  They do NOT certify duty-table correctness or e-filing behaviour — that is
  the domain of the 10 functional suites.
- When the customer base grows, re-run stress after each infra change
  (DB resize, region move, plan-tier feature flags).
