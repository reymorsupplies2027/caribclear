/**
 * CaribClear — Payment gateway adapters (WiPay + PayPal), REAL implementations.
 *
 * Design: self-service checkout that accepts the tenant's plan rental payment
 * and activates the subscription on confirmed payment. Both adapters are
 * activated by environment variables; without credentials the checkout API
 * returns an honest `manual` flow (bank transfer / manual activation by the
 * platform admin) instead of pretending to charge.
 *
 * WiPay (wipaycaribbean.com — T&T native gateway, settles locally):
 *  - Hosted redirect checkout. Merchant posts the buyer to the WiPay
 *    gateway with: developer_id/merchant id, order_id, total, currency,
 *    return_url, and an MD5 checksum so WiPay (and we) can detect tampering.
 *  - Fee benchmark (official T&T terms, Oct 2025): 3%–3.5% of card
 *    transaction value + US$0.25 gateway fee; refund US$0.75.
 *    → research/48-wipay-fees.json
 *  - Checksum rule (WiPay developer docs): md5(order_id + merchant_id +
 *    total + currency + md5_key) — lowercase hex.
 *
 * PayPal (REST Orders v2):
 *  - Server-to-server order creation (POST /v2/checkout/orders) then client
 *    approval, then capture (POST /v2/checkout/orders/{id}/capture).
 *  - Works for Caribbean merchants, BUT PayPal does not withdraw directly
 *    to TTD bank accounts (research/49) — funds sit in USD until withdrawn
 *    to a US bank / card. That is why WiPay is the primary rental rail and
 *    PayPal the international fallback.
 *
 * Nothing in this file fakes a payment: if credentials are missing, callers
 * get `{ configured: false }` and the UI shows the manual flow.
 */

import { createHash } from 'crypto';

// ─── WiPay ───────────────────────────────────────────────────────────────────

export const WIPAY_GATEWAY_URL = process.env.WIPAY_GATEWAY_URL || 'https://gateway.wipayforbusiness.com/wipay-gateway/index.php';

export function wipayConfigured(): boolean {
  return Boolean(process.env.WIPAY_MERCHANT_ID && process.env.WIPAY_MD5_KEY);
}

/** WiPay request checksum: md5(order_id + merchant_id + total + currency + md5_key). */
export function wipayChecksum(orderId: string, total: string, currency: string): string {
  const key = process.env.WIPAY_MD5_KEY || '';
  const merchant = process.env.WIPAY_MERCHANT_ID || '';
  return createHash('md5').update(`${orderId}${merchant}${total}${currency}${key}`).digest('hex');
}

/** Verify the hash WiPay sends back on return: md5(md5_key + transaction_id + order_id + total). */
export function wipayReturnChecksum(transactionId: string, orderId: string, total: string): string {
  const key = process.env.WIPAY_MD5_KEY || '';
  return createHash('md5').update(`${key}${transactionId}${orderId}${total}`).digest('hex');
}

export interface WipayCheckoutRequest {
  orderId: string;
  total: number;          // in currency units
  currency: 'TTD' | 'USD' | 'JMD';
  returnUrl: string;
  cancelUrl: string;
  name: string;           // payer name
  email: string;
  phone?: string;
}

export function buildWipayCheckout(req: WipayCheckoutRequest): { url: string; fields: Record<string, string> } {
  const total = req.total.toFixed(2);
  const fields: Record<string, string> = {
    business_developer_id: process.env.WIPAY_MERCHANT_ID || '',
    order_id: req.orderId,
    total,
    currency: req.currency,
    fee_structure: 'customer_pay', // platform nets the full rental amount
    developer_id: process.env.WIPAY_MERCHANT_ID || '',
    return_url: req.returnUrl,
    cancel_url: req.cancelUrl,
    name: req.name,
    email: req.email,
    phone: req.phone || '',
  };
  // WiPay expects the checksum as md5 of order_id+merchant+total+currency+key
  const md5 = wipayChecksum(req.orderId, total, req.currency);
  fields.md5 = md5;
  const query = new URLSearchParams(fields);
  return { url: `${WIPAY_GATEWAY_URL}?${query.toString()}`, fields };
}

// ─── PayPal ──────────────────────────────────────────────────────────────────

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function paypalBase(): string {
  return process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
}

async function paypalAccessToken(): Promise<string> {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export interface PaypalOrder {
  id: string;
  approveUrl: string;
}

/** Create a PayPal order for the rental (USD). Returns approve link for the payer. */
export async function createPaypalOrder(opts: {
  orderId: string;      // our PaymentRequest id
  amountUsd: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<PaypalOrder> {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: opts.orderId,
        custom_id: opts.orderId,
        description: opts.description.slice(0, 127),
        amount: { currency_code: 'USD', value: opts.amountUsd.toFixed(2) },
      }],
      application_context: {
        brand_name: 'CaribClear',
        user_action: 'PAY_NOW',
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    }),
  });
  const json = await res.json() as {
    id?: string;
    links?: Array<{ rel: string; href: string }>;
    message?: string;
  };
  if (!res.ok || !json.id) throw new Error(`PayPal order failed: ${json.message || res.status}`);
  const approve = json.links?.find((l) => l.rel === 'approve' || l.rel === 'payer-action');
  return { id: json.id, approveUrl: approve?.href || '' };
}

/** Capture an approved PayPal order. Returns capture status + reference. */
export async function capturePaypalOrder(paypalOrderId: string): Promise<{ status: string; captureId: string | null }> {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const json = await res.json() as {
    status?: string;
    purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string; status?: string }> } }>;
    message?: string;
  };
  if (!res.ok) throw new Error(`PayPal capture failed: ${json.message || res.status}`);
  const capture = json.purchase_units?.[0]?.payments?.captures?.[0];
  return { status: json.status || capture?.status || 'UNKNOWN', captureId: capture?.id || null };
}
