/**
 * POST /api/billing/checkout — broker admin starts a rental payment.
 *
 * Body: { plan: 'pro'|'regional'|'enterprise', provider?: 'wipay'|'paypal'|'manual' }
 *
 * Behaviour (honest by design):
 *  - WiPay credentials configured  → PaymentRequest + real gateway redirect URL.
 *  - PayPal credentials configured → PaymentRequest + real PayPal approve URL.
 *  - No credentials / provider=manual → PaymentRequest(status created) +
 *    manual instructions (bank transfer); the platform super admin confirms
 *    via /api/billing/manual-confirm. Nothing pretends to be paid.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireBrokerAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { PLANS, planPriceUsd, type PlanId } from '@/lib/plans';
import {
  wipayConfigured, buildWipayCheckout,
  paypalConfigured, createPaypalOrder,
} from '@/lib/billing/gateways';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const body = await readJson<{ plan?: string; provider?: string }>(req);
    const plan = String(body.plan || '') as PlanId;
    if (!(plan in PLANS) || plan === 'free') {
      return fail(400, 'BAD_PLAN', 'plan must be pro, regional or enterprise.');
    }
    const provider = ['wipay', 'paypal', 'manual'].includes(String(body.provider)) ? String(body.provider) : 'wipay';

    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
    if (!tenant) return fail(404, 'TENANT_NOT_FOUND', 'Tenant not found.');
    const amountUsd = planPriceUsd(plan, tenant.priceUsd);

    const pr = await db.paymentRequest.create({
      data: {
        tenantId: s.tenantId,
        plan,
        provider,
        amountUsd,
        currency: 'USD',
        status: 'created',
      },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'billing.checkout_created',
      entityType: 'payment_request', entityId: pr.id,
      metadata: { plan, provider, amountUsd },
    });

    const origin = req.nextUrl.origin;

    // ── WiPay: hosted redirect (primary Caribbean rail) ──
    if (provider === 'wipay') {
      if (!wipayConfigured()) {
        return ok({
          paymentRequestId: pr.id, provider: 'manual',
          manual: true,
          message: 'WiPay checkout is not configured yet (WIPAY_MERCHANT_ID / WIPAY_MD5_KEY missing on the server). Pay by bank transfer and the platform admin activates the plan.',
        });
      }
      const checkout = buildWipayCheckout({
        orderId: pr.id,
        total: amountUsd,
        currency: 'USD',
        returnUrl: `${origin}/api/billing/wipay/return`,
        cancelUrl: `${origin}/dashboard/billing?checkout=cancelled`,
        name: tenant.name,
        email: tenant.contactEmail || 'billing@caribclear.com',
      });
      await db.paymentRequest.update({
        where: { id: pr.id },
        data: { status: 'redirect_pending', providerPayload: JSON.stringify({ url: checkout.url }) },
      });
      return ok({ paymentRequestId: pr.id, provider: 'wipay', redirectUrl: checkout.url });
    }

    // ── PayPal: REST order (international rail) ──
    if (provider === 'paypal') {
      if (!paypalConfigured()) {
        return ok({
          paymentRequestId: pr.id, provider: 'manual',
          manual: true,
          message: 'PayPal checkout is not configured yet (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing on the server). Pay by bank transfer and the platform admin activates the plan.',
        });
      }
      const order = await createPaypalOrder({
        orderId: pr.id,
        amountUsd,
        description: `CaribClear ${PLANS[plan].label} plan — 12 months rental`,
        returnUrl: `${origin}/api/billing/paypal/return`,
        cancelUrl: `${origin}/dashboard/billing?checkout=cancelled`,
      });
      await db.paymentRequest.update({
        where: { id: pr.id },
        data: {
          status: 'redirect_pending',
          providerRef: order.id,
          providerPayload: JSON.stringify({ approveUrl: order.approveUrl, paypalOrderId: order.id }),
        },
      });
      return ok({ paymentRequestId: pr.id, provider: 'paypal', redirectUrl: order.approveUrl, paypalOrderId: order.id });
    }

    // ── Manual: bank transfer ──
    return ok({
      paymentRequestId: pr.id, provider: 'manual', manual: true,
      amountUsd,
      message: 'Pay by bank transfer to the platform account, then the platform admin confirms activation.',
    });
  } catch (err) { return guardError(err); }
}
