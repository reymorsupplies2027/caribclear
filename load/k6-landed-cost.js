import http from 'k6/http';
import { check, group } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * CaribClear — landed-cost API load test (k6).
 *
 * SMOKE  (default): 20 VU for 60s      — sanity after deploys
 * STRESS           : ramp 20 → 500 VU  — find the ceiling before customers do
 *
 *   k6 run load/k6-landed-cost.js                       (smoke)
 *   k6 run -e PROFILE=stress -e BASE=https://staging.example load/k6-landed-cost.js
 *
 * Target: a reachable environment with a seeded tenant. The calculator call
 * uses ?preview=1 ON PURPOSE: previews persist nothing and consume no plan
 * quota, so the run does not pollute real tenants' data or allowances.
 */

const BASE = __ENV.BASE || 'http://localhost:3000';
const PROFILE = __ENV.PROFILE || 'smoke';
const EMAIL = __ENV.EMAIL || '';     // seeded staff account
const PASSWORD = __ENV.PASSWORD || '';

const calcDuration = new Trend('landed_cost_duration');

export const options = {
  smoke: {
    vus: 20,
    duration: '60s',
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<500'],
      landed_cost_duration: ['p(95)<500'],
    },
  },
  stress: {
    stages: [
      { duration: '1m', target: 50 },
      { duration: '2m', target: 200 },
      { duration: '2m', target: 500 },
      { duration: '2m', target: 500 },
      { duration: '1m', target: 0 },
    ],
    thresholds: {
      http_req_failed: ['rate<0.05'],
      http_req_duration: ['p(95)<2000'],
    },
  },
}[PROFILE];

export function setup() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set EMAIL and PASSWORD env vars for a seeded staff account.');
    // Continue anyway: public endpoints still exercise the edge.
  }
  const login = http.post(`${BASE}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } });
  const cookie = login.headers['Set-Cookie'] || '';
  return { cookie };
}

export default function loadTest(data) {
  const headers = { 'Content-Type': 'application/json', Cookie: data.cookie };

  group('public plan catalog', () => {
    const r = http.get(`${BASE}/api/billing/plans`);
    check(r, { 'plans 200': (res) => res.status === 200 });
  });

  group('health', () => {
    const r = http.get(`${BASE}/api/health`);
    check(r, { 'health 200': (res) => res.status === 200 });
  });

  group('landed cost (preview — no persistence, no quota)', () => {
    const payload = JSON.stringify({
      hsCode: '8528',
      fobUsd: 5000,
      freightUsd: 800,
      insuranceUsd: 40,
      exchangeRate: 6.8,
      containers: ['40ft'],
    });
    const r = http.post(`${BASE}/api/costs?preview=1`, payload, { headers });
    calcDuration.add(r.timings.duration);
    check(r, {
      'calc 200/404 (engine answered)': (res) => [200, 404].includes(res.status),
    });
  });
}
