/**
 * CaribClear — Plan limit enforcement (server-side).
 *
 * plans.ts is the business config; THIS file is the enforcement. Before this
 * module existed the Free limits lived only on the marketing page — the API
 * happily served unlimited shipments/calculations to US$0 tenants. Now every
 * consuming endpoint calls these guards BEFORE writing.
 *
 * Design:
 *  - Pure evaluators (testable without a DB) + a thrown PlanLimitError that
 *    guardError maps to HTTP 403 with a machine-readable code.
 *  - DB counting stays in the route handlers (they know the tenant context);
 *    this module only does arithmetic on the numbers they pass in.
 *  - "Active" shipments = not yet released and not cancelled. A released
 *    shipment is finished business — it stops consuming the Free slot.
 */
import { planLimits } from '@/lib/plans';

export type PlanLimitCode =
  | 'PLAN_LIMIT_SHIPMENTS'
  | 'PLAN_LIMIT_CALCS'
  | 'PLAN_LIMIT_VAULT'
  | 'PLAN_LIMIT_USERS';

const TERMINAL_SHIPMENT_STATUSES = ['released', 'cancelled'];

export function isActiveShipmentStatus(status: string, closedAt?: Date | null): boolean {
  return !TERMINAL_SHIPMENT_STATUSES.includes(status) && !closedAt;
}

export interface PlanCheck {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
}

function check(plan: string, limit: number, used: number): PlanCheck {
  return { allowed: used < limit, limit, used, remaining: Math.max(0, limit - used) };
}

/** Free plan allows 3 ACTIVE shipments; released/cancelled free the slot. */
export function checkShipmentAllowance(plan: string, activeCount: number): PlanCheck {
  return check(plan, planLimits(plan).activeShipments, activeCount);
}

/**
 * Free plan allows a fixed number of PERSISTED calculations per calendar month.
 * Preview calculations (?preview=1) never persist and never consume quota —
 * the calculator UI runs previews by default, so free users still get to try
 * the engine as much as they want; only saved (official) results count.
 */
export function checkCalcAllowance(plan: string, calcsThisMonth: number): PlanCheck {
  return check(plan, planLimits(plan).calcsPerMonth, calcsThisMonth);
}

/** Vault quota: sum of stored bytes (all versions — storage holds them all) + incoming file. */
export function checkVaultAllowance(plan: string, usedBytes: number, incomingBytes = 0): PlanCheck {
  const limitBytes = Math.round(planLimits(plan).vaultGb * 1024 * 1024 * 1024);
  const total = usedBytes + Math.max(0, incomingBytes);
  return { allowed: total <= limitBytes, limit: limitBytes, used: total, remaining: Math.max(0, limitBytes - total) };
}

export function checkUserAllowance(plan: string, userCount: number): PlanCheck {
  return check(plan, planLimits(plan).users, userCount);
}

/** First day of the current month (UTC) — the window for calc counting. */
export function startOfCurrentMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class PlanLimitError extends Error {
  code: PlanLimitCode;
  limit: number;
  used: number;
  upgradePlan: string;
  constructor(code: PlanLimitCode, message: string, opts: { limit: number; used: number; upgradePlan?: string }) {
    super(message);
    this.code = code;
    this.limit = opts.limit;
    this.used = opts.used;
    this.upgradePlan = opts.upgradePlan || 'pro';
  }
}

/** Throw a PlanLimitError when the check fails — routes wrap this in guardError. */
export function assertPlanLimit(c: PlanCheck, code: PlanLimitCode, what: string, upgradePlan = 'pro') {
  if (c.allowed) return;
  const humanLimit = code === 'PLAN_LIMIT_VAULT'
    ? `${(c.limit / (1024 * 1024 * 1024)).toFixed(1)} GB`
    : c.limit;
  throw new PlanLimitError(
    code,
    `The Free plan allows ${humanLimit} ${what}. You have used ${c.used}. Upgrade to ${upgradePlan} to continue.`,
    { limit: c.limit, used: c.used, upgradePlan },
  );
}
