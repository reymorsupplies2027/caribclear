/**
 * POST /api/billing/paypal/capture — client-side completion alternative to the
 * redirect return. Body: { paymentRequestId }. Captures the approved PayPal
 * order server-side and activates the subscription on COMPLETED.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireBrokerAdmin } from '@/lib/guard';
import { capturePaypalOrder } from '@/lib/billing/gateways';
import { activateSubscription } from '@/lib/billing/activate';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const body = await readJson<{ paymentRequestId?: string }>(req);
    if (!body.paymentRequestId) return fail(400, 'MISSING_FIELDS', 'paymentRequestId required.');

    const pr = await db.paymentRequest.findFirst({
      where: { id: body.paymentRequestId, tenantId: s.tenantId, provider: 'paypal' },
    });
    if (!pr) return fail(404, 'NOT_FOUND', 'Payment request not found.');
    if (!pr.providerRef) return fail(400, 'NO_ORDER', 'This payment request has no PayPal order attached.');
    if (pr.status === 'paid') return ok({ activated: true, alreadyPaid: true, plan: pr.plan });

    const capture = await capturePaypalOrder(pr.providerRef);
    if (capture.status === 'COMPLETED') {
      const res = await activateSubscription({
        tenantId: pr.tenantId, plan: pr.plan, paymentRequestId: pr.id,
        providerRef: capture.captureId || pr.providerRef,
        userId: s.userId, actorLabel: 'paypal_capture',
      });
      return ok({ activated: true, plan: res.plan, subscriptionEndsAt: res.subscriptionEndsAt });
    }
    await db.paymentRequest.update({
      where: { id: pr.id },
      data: { status: 'failed', providerPayload: JSON.stringify({ captureStatus: capture.status }) },
    });
    return ok({ activated: false, captureStatus: capture.status });
  } catch (err) { return guardError(err); }
}
