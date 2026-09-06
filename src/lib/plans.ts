/**
 * CaribClear — Plan definitions (business config, NOT legal rates).
 * Legal/tax rates live in the versioned RateConfig table. These are OUR prices.
 */
export const PLANS = {
  free: { id: 'free', label: 'Free', priceUsd: 0, limits: { users: 1, activeShipments: 3, vaultGb: 0.5 } },
  pro: { id: 'pro', label: 'Pro', priceUsd: 149, limits: { users: 10, activeShipments: 9999, vaultGb: 50 } },
} as const;

export type PlanId = keyof typeof PLANS;

export function planPriceUsd(plan: string, override?: number | null): number {
  if (typeof override === 'number' && override >= 0) return override;
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : 'free'].priceUsd;
}

export const REGIONS = [
  'Trinidad',
  'Tobago',
  'Jamaica',
  'Barbados',
  'Guyana',
  'CARICOM',
] as const;

export function planLimits(plan: string) {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : 'free'].limits;
}
