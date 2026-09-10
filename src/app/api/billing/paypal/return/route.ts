/**
 * GET /api/billing/paypal/return — PayPal redirects the payer back here after
 * approval (?token=<paypalOrderId>). Captures the order server-side and
 * activates the subscription on COMPLETED.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError } from '@/lib/api';
import { capturePaypalOrder } from '@/lib/billing/gateways';
import { activateSubscription } from '@/lib/billing/activate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const paypalOrderId = req.nextUrl.searchParams.get('token') || '';
    if (!paypalOrderId) return fail(400, 'MISSING_ORDER', 'PayPal order token missing.');

    const pr = await db.paymentRequest.findFirst({ where: { providerRef: paypalOrderId, provider: 'paypal' } });
    if (!pr) return fail(404, 'NOT_FOUND', 'Payment request not found for this PayPal order.');

    if (pr.status === 'paid') {
      return ok({ activated: true, alreadyPaid: true, plan: pr.plan });
    }

    const capture = await capturePaypalOrder(paypalOrderId);
    if (capture.status === 'COMPLETED') {
      await activateSubscription({
        tenantId: pr.tenantId,
        plan: pr.plan,
        paymentRequestId: pr.id,
        providerRef: capture.captureId || paypalOrderId,
        userId: null,
        actorLabel: 'paypal_capture',
      });
      const tenant = await db.tenant.findUnique({ where: { id: pr.tenantId } });
      return ok({ activated: true, plan: pr.plan, subscriptionEndsAt: tenant?.subscriptionEndsAt ?? null });
    }

    await db.paymentRequest.update({
      where: { id: pr.id },
      data: { status: 'failed', providerPayload: JSON.stringify({ captureStatus: capture.status }) },
    });
    return ok({ activated: false, captureStatus: capture.status });
  } catch (err) { return guardError(err); }
}
