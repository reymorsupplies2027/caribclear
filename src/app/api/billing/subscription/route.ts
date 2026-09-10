/** GET /api/billing/subscription — tenant's own billing state (plan, invoices, payments). */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, guardError } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { planLimits, planPriceUsd, planCoversRegion } from '@/lib/plans';
import { wipayConfigured, paypalConfigured } from '@/lib/billing/gateways';
import { REGION_RATE_SETS } from '@/lib/engine/region-rates';
import { CUSTOMS_REGIONS } from '@/lib/engine/customs-regions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
    if (!tenant) return ok({ plan: 'free' });

    const [invoices, payments] = await Promise.all([
      db.tenantInvoice.findMany({ where: { tenantId: s.tenantId }, orderBy: { dueDate: 'desc' }, take: 24 }),
      db.paymentRequest.findMany({ where: { tenantId: s.tenantId }, orderBy: { createdAt: 'desc' }, take: 24 }),
    ]);

    return ok({
      plan: tenant.plan,
      priceUsd: planPriceUsd(tenant.plan, tenant.priceUsd),
      limits: planLimits(tenant.plan),
      subscriptionEndsAt: tenant.subscriptionEndsAt,
      isActive: tenant.isActive,
      invoices,
      payments,
      regions: {
        covered: CUSTOMS_REGIONS.filter((r) => planCoversRegion(tenant.plan, r.code))
          .map((r) => ({ code: r.code, country: r.country, calibration: r.calibration })),
        rateSets: REGION_RATE_SETS.map((r) => ({ code: r.code, country: r.country, currency: r.currency })),
      },
      paymentRails: { wipay: wipayConfigured(), paypal: paypalConfigured(), manual: true },
    });
  } catch (err) { return guardError(err); }
}
