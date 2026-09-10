/** GET /api/billing/plans — public plan catalog + which payment rails are live. */
import { ok } from '@/lib/api';
import { PLANS, PAID_PLANS } from '@/lib/plans';
import { wipayConfigured, paypalConfigured } from '@/lib/billing/gateways';

export const dynamic = 'force-dynamic';

export async function GET() {
  const catalog = PAID_PLANS.map((id) => PLANS[id]);
  return ok({
    plans: catalog,
    free: PLANS.free,
    paymentRails: {
      wipay: wipayConfigured(),     // true = self-service checkout live
      paypal: paypalConfigured(),   // true = international checkout live
      manual: true,                 // always available: bank transfer + admin confirmation
    },
    currency: 'USD',
    note: 'Rental is flat per month — no per-transaction toll. Enterprise price is the from-price; final quote depends on seats and calibration packs.',
  });
}
