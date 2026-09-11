/**
 * CaribClear — Plan limit enforcement test suite (pure evaluators).
 * Run: bun tests/plan-guard.test.ts
 * Covers: active-shipment semantics, monthly calc quota, vault byte quota,
 * user seats, month-window math, error codes and limit metadata.
 */
import {
  checkShipmentAllowance, checkCalcAllowance, checkVaultAllowance, checkUserAllowance,
  isActiveShipmentStatus, startOfCurrentMonth, assertPlanLimit, PlanLimitError,
} from '../src/lib/plan-guard';

let passed = 0; let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}
function throws(fn: () => void, code: string, name: string) {
  try { fn(); failed++; console.error(`  ✗ FAIL: ${name} (no throw)`); }
  catch (e) {
    const right = e instanceof PlanLimitError && e.code === code;
    if (right) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.error(`  ✗ FAIL: ${name} (wrong error: ${String(e)})`); }
  }
}
function passes(fn: () => void, name: string) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ FAIL: ${name} (threw: ${String(e)})`); }
}

console.log('\n── 1. Active shipment semantics ──');
// A slot frees ONLY at a terminal state (released / cancelled) or closedAt.
ok(isActiveShipmentStatus('order_placed'), 'order_placed is active');
ok(isActiveShipmentStatus('in_customs'), 'in_customs is active');
ok(!isActiveShipmentStatus('released'), 'released is NOT active (frees the slot)');
ok(!isActiveShipmentStatus('cancelled'), 'cancelled is NOT active (frees the slot)');
ok(!isActiveShipmentStatus('in_transit', new Date()), 'closedAt set → NOT active regardless of status');

console.log('\n── 2. Free plan: 3 active shipments ──');
ok(checkShipmentAllowance('free', 0).allowed, 'free 0/3 allowed');
ok(checkShipmentAllowance('free', 2).allowed, 'free 2/3 allowed');
ok(!checkShipmentAllowance('free', 3).allowed, 'free 3/3 BLOCKED');
ok(checkShipmentAllowance('free', 3).remaining === 0, 'remaining = 0 at the line');
ok(checkShipmentAllowance('free', 5).limit === 3, 'limit reported is 3 even when over');
// Released shipments were already filtered before counting — but the math holds.
ok(checkShipmentAllowance('free', 2).remaining === 1, '2 active → 1 slot left');

console.log('\n── 3. Paid plans: effectively unlimited ──');
ok(checkShipmentAllowance('pro', 9998).allowed, 'pro allows 9998');
ok(checkShipmentAllowance('regional', 5000).allowed, 'regional allows 5000');
ok(checkShipmentAllowance('enterprise', 9000).allowed, 'enterprise allows 9000');

console.log('\n── 4. Calc quota: free 10/month, previews never counted ──');
ok(checkCalcAllowance('free', 0).allowed, 'free 0/10 calcs allowed');
ok(checkCalcAllowance('free', 9).allowed, 'free 9/10 allowed');
ok(!checkCalcAllowance('free', 10).allowed, 'free 10/10 BLOCKED');
ok(checkCalcAllowance('free', 10).limit === 10, 'calc limit is 10');
ok(checkCalcAllowance('pro', 9998).allowed, 'pro calcs effectively unlimited');

console.log('\n── 5. Vault quota: bytes, all versions ──');
const GB = 1024 * 1024 * 1024;
ok(checkVaultAllowance('free', 0, 100).allowed, 'empty vault accepts a file');
ok(checkVaultAllowance('free', 0.4 * GB, 0.1 * GB).allowed, '0.4 + 0.1 GB = exactly 0.5 → allowed (<=)');
ok(!checkVaultAllowance('free', 0.4 * GB, 0.1000001 * GB).allowed, 'over 0.5 GB by one byte → BLOCKED');
ok(checkVaultAllowance('free', 0.6 * GB, 0).allowed === false, 'already-over vault blocks even 0-byte upload');
ok(checkVaultAllowance('pro', 40 * GB, 5 * GB).allowed, 'pro: 45/50 GB allowed');
ok(!checkVaultAllowance('enterprise', 499 * GB, 2 * GB).allowed, 'enterprise: 501/500 GB blocked (real math, no exceptions)');

console.log('\n── 6. User seats ──');
ok(checkUserAllowance('free', 0).allowed && checkUserAllowance('free', 0).limit === 1, 'free = 1 seat');
ok(!checkUserAllowance('free', 1).allowed, 'free 1/1 seat BLOCKED (the one seat is taken)');
ok(checkUserAllowance('pro', 9).allowed && !checkUserAllowance('pro', 10).allowed, 'pro = 10 seats');

console.log('\n── 7. Month window (UTC) ──');
const w = startOfCurrentMonth(new Date('2026-09-11T14:30:00Z'));
ok(w.getUTCFullYear() === 2026 && w.getUTCMonth() === 8 && w.getUTCDate() === 1, 'Sep 11 → window starts Sep 1');
ok(w.getUTCHours() === 0 && w.getUTCMinutes() === 0, 'window starts at midnight UTC');
const y = startOfCurrentMonth(new Date('2026-01-05T00:00:00Z'));
ok(y.getUTCFullYear() === 2026 && y.getUTCMonth() === 0, 'January stays in January (no year underflow)');

console.log('\n── 8. assertPlanLimit → PlanLimitError with metadata ──');
passes(() => assertPlanLimit(checkShipmentAllowance('free', 2), 'PLAN_LIMIT_SHIPMENTS', 'active shipments'), 'under limit does not throw');
throws(() => assertPlanLimit(checkShipmentAllowance('free', 3), 'PLAN_LIMIT_SHIPMENTS', 'active shipments'), 'PLAN_LIMIT_SHIPMENTS', 'shipments over limit → PLAN_LIMIT_SHIPMENTS');
throws(() => assertPlanLimit(checkCalcAllowance('free', 10), 'PLAN_LIMIT_CALCS', 'saved calculations'), 'PLAN_LIMIT_CALCS', 'calcs over limit → PLAN_LIMIT_CALCS');
throws(() => assertPlanLimit(checkVaultAllowance('free', GB, 0), 'PLAN_LIMIT_VAULT', 'vault'), 'PLAN_LIMIT_VAULT', 'vault over limit → PLAN_LIMIT_VAULT');
let captured: PlanLimitError | null = null;
try { assertPlanLimit(checkShipmentAllowance('free', 7), 'PLAN_LIMIT_SHIPMENTS', 'active shipments'); } catch (e) { captured = e as PlanLimitError; }
ok(captured !== null && captured.limit === 3 && captured.used === 7 && captured.upgradePlan === 'pro', 'error carries limit/used/upgrade metadata');
ok(captured !== null && captured.message.includes('3') && captured.message.toLowerCase().includes('upgrade'), 'human message mentions the limit and upgrade path');

console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
if (failed > 0) process.exit(1);
