/**
 * CaribClear — Plan definitions (business config, NOT legal rates).
 * Legal/tax rates live in the versioned RateConfig table. These are OUR prices.
 *
 * Pricing rationale (verified leader benchmarks, research/43-47,58):
 *  - Magaya: ~US$3,000 setup + US$300–350/user/month (Reddit operator, 2023; bill US$250)
 *  - Descartes e-Customs: from €200/month + €800 setup (descartes.com pricing page)
 *  - CargoWise: US$9.95–19.95/transaction; implementations US$50k–$200k+ (checkthat.ai, GoFreight)
 *  - Zonos Landed Cost: US$2 per guaranteed order + 10% of duties/taxes (gingercontrol.com, May 2026)
 *  - SimplyDuty: £0.10/call pay-per-use; US$199/month per 10,000 calls (tariffsapi.com)
 * CaribClear rents flat per month — no per-transaction toll — at a fraction
 * of the leaders' entry cost, focused on ASYCUDA Caribbean trade lanes.
 */
export const PLANS = {
  free: {
    id: 'free', label: 'Free', priceUsd: 0,
    limits: { users: 1, activeShipments: 3, vaultGb: 0.5, regions: ['TT'] as string[] },
    blurb: 'Try the engine, 3 shipments, Trinidad rates.',
  },
  pro: {
    id: 'pro', label: 'Pro', priceUsd: 149,
    limits: { users: 10, activeShipments: 9999, vaultGb: 50, regions: ['TT'] as string[] },
    blurb: 'Working broker in Trinidad: engine v2, 6 official forms, e-filing C82, AI features, 50 GB vault.',
  },
  regional: {
    id: 'regional', label: 'Regional', priceUsd: 449,
    limits: { users: 15, activeShipments: 9999, vaultGb: 100, regions: 'ALL' as unknown as string[] },
    blurb: 'Rent the service across the Caribbean: all 13 ASYCUDA administrations, regional landed-cost rates (JM/BB/GY/LC/VC/GD/AG), regional e-filing, 100 GB vault.',
  },
  enterprise: {
    id: 'enterprise', label: 'Enterprise', priceUsd: 1500,
    limits: { users: 999, activeShipments: 9999, vaultGb: 500, regions: 'ALL' as unknown as string[] },
    blurb: 'Big shippers & multi-office brokers: everything in Regional + country calibration packs, SLA, ERP integration, dedicated onboarding, unlimited seats review.',
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const PAID_PLANS: PlanId[] = ['pro', 'regional', 'enterprise'];

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

/** Does this plan grant access to a customs region code ('TT', 'JM', …)? */
export function planCoversRegion(plan: string, regionCode: string): boolean {
  const limits = planLimits(plan);
  const regions = limits.regions;
  if (regions === ('ALL' as unknown as string[])) return true;
  if (!Array.isArray(regions)) return false;
  if (regions.includes(regionCode.toUpperCase())) return true;
  // 'TT' plan also covers Tobago shipments — same administration.
  return regions.includes('TT') && regionCode.toUpperCase() === 'TT';
}

export function planLimits(plan: string) {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : 'free'].limits;
}
