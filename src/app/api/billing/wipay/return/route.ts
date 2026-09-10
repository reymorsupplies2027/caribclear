/**
 * GET /api/billing/wipay/return — WiPay redirects the payer back here.
 * Query (WiPay return spec): transaction_id, order_id (= our PaymentRequest id),
 * status ('successful'|'failed'|'cancelled'), total, hash (md5 of key+txn+order+total).
 *
 * Verifies the hash against WIPAY_MD5_KEY, then activates the subscription on
 * success. Never trusts status without the checksum matching.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError } from '@/lib/api';
import { wipayReturnChecksum } from '@/lib/billing/gateways';
import { activateSubscription } from '@/lib/billing/activate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const transactionId = q.get('transaction_id') || '';
    const orderId = q.get('order_id') || '';
    const status = (q.get('status') || '').toLowerCase();
    const total = q.get('total') || '';
    const hash = q.get('hash') || '';

    if (!orderId) return fail(400, 'MISSING_ORDER', 'order_id missing in WiPay return.');
    const pr = await db.paymentRequest.findUnique({ where: { id: orderId } });
    if (!pr) return fail(404, 'NOT_FOUND', 'Payment request not found.');

    // Hash check (WiPay): md5(md5_key + transaction_id + order_id + total)
    if (transactionId && total) {
      const expected = wipayReturnChecksum(transactionId, orderId, total);
      if (expected !== hash.toLowerCase()) {
        await db.paymentRequest.update({
          where: { id: pr.id },
          data: { status: 'failed', providerPayload: JSON.stringify({ error: 'hash_mismatch', got: hash }) },
        });
        return fail(400, 'HASH_MISMATCH', 'WiPay return hash does not verify — payment not accepted.');
      }
    }

    if (status === 'successful' && pr.status !== 'paid') {
      await activateSubscription({
        tenantId: pr.tenantId,
        plan: pr.plan,
        paymentRequestId: pr.id,
        providerRef: transactionId || null,
        userId: null,
        actorLabel: 'wipay_return',
      });
      const tenant = await db.tenant.findUnique({ where: { id: pr.tenantId } });
      return ok({ activated: true, plan: pr.plan, subscriptionEndsAt: tenant?.subscriptionEndsAt ?? null });
    }

    // Failed / cancelled — record and surface honestly.
    await db.paymentRequest.update({
      where: { id: pr.id },
      data: { status: status === 'successful' ? pr.status : 'failed', providerPayload: JSON.stringify({ wipayStatus: status, transactionId }) },
    });
    return ok({ activated: false, wipayStatus: status });
  } catch (err) { return guardError(err); }
}
