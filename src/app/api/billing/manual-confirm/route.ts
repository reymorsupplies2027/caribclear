/**
 * POST /api/billing/manual-confirm — platform super admin confirms a manual
 * (bank transfer) payment and activates the subscription.
 * Body: { paymentRequestId }.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { activateSubscription } from '@/lib/billing/activate';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin(req);
    const body = await readJson<{ paymentRequestId?: string }>(req);
    if (!body.paymentRequestId) return fail(400, 'MISSING_FIELDS', 'paymentRequestId required.');

    const pr = await db.paymentRequest.findUnique({ where: { id: body.paymentRequestId } });
    if (!pr) return fail(404, 'NOT_FOUND', 'Payment request not found.');
    if (pr.status === 'paid') return ok({ activated: true, alreadyPaid: true, plan: pr.plan });

    const res = await activateSubscription({
      tenantId: pr.tenantId,
      plan: pr.plan,
      paymentRequestId: pr.id,
      providerRef: pr.providerRef || `manual_${pr.id}`,
      userId: admin.userId,
      actorLabel: 'manual_confirm',
    });
    return ok({ activated: true, plan: res.plan, subscriptionEndsAt: res.subscriptionEndsAt });
  } catch (err) { return guardError(err); }
}
