/**
 * CaribClear — Subscription activation shared by all payment paths
 * (WiPay return, PayPal capture, manual admin confirmation).
 *
 * One place so every rail produces the SAME state change:
 *  1. PaymentRequest → paid (with providerRef for traceability)
 *  2. Tenant.plan updated + subscriptionEndsAt extended +1 year
 *  3. Current-period TenantInvoice (if pending) marked paid
 *  4. Audit log entry
 */
import { db } from '@/lib/db';
import { appendAuditLog } from '@/lib/audit';
import { planPriceUsd } from '@/lib/plans';

export async function activateSubscription(opts: {
  tenantId: string;
  plan: string;
  paymentRequestId?: string | null;
  providerRef?: string | null;
  userId: string | null;         // actor (admin user or null for gateway callback)
  actorLabel: string;            // e.g. 'wipay_return', 'paypal_capture', 'manual_confirm'
}): Promise<{ plan: string; subscriptionEndsAt: Date }> {
  const now = new Date();
  const subscriptionEndsAt = new Date(now.getTime() + 365 * 86400000);

  await db.tenant.update({
    where: { id: opts.tenantId },
    data: { plan: opts.plan, subscriptionEndsAt, isActive: true },
  });

  if (opts.paymentRequestId) {
    await db.paymentRequest.updateMany({
      where: { id: opts.paymentRequestId, tenantId: opts.tenantId },
      data: { status: 'paid', providerRef: opts.providerRef || null, confirmedAt: now },
    });
  }

  // If the platform already issued this month's rental invoice, settle it.
  const period = now.toISOString().slice(0, 7);
  const pending = await db.tenantInvoice.findFirst({
    where: { tenantId: opts.tenantId, period, status: { not: 'paid' } },
  });
  if (pending) {
    await db.tenantInvoice.update({
      where: { id: pending.id },
      data: { status: 'paid', paidAt: now },
    });
  }

  await appendAuditLog({
    tenantId: opts.tenantId,
    userId: opts.userId,
    action: `billing.subscription_activated.${opts.actorLabel}`,
    entityType: 'tenant',
    entityId: opts.tenantId,
    metadata: {
      plan: opts.plan,
      priceUsd: planPriceUsd(opts.plan),
      providerRef: opts.providerRef || null,
      subscriptionEndsAt: subscriptionEndsAt.toISOString(),
    },
  });

  return { plan: opts.plan, subscriptionEndsAt };
}
