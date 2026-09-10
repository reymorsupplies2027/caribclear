/**
 * CaribClear — Billing layer test suite (plans + payment gateways).
 * Run: bun tests/billing.test.ts
 * Covers: plan catalog/coverage logic, WiPay checksum + request builder,
 * PayPal configuration detection, honest degradation (no fake payments).
 */
import { createHash } from 'crypto';
import { PLANS, PAID_PLANS, planPriceUsd, planLimits, planCoversRegion } from '../src/lib/plans';
import {
  wipayConfigured, wipayChecksum, wipayReturnChecksum, buildWipayCheckout, WIPAY_GATEWAY_URL,
  paypalConfigured, createPaypalOrder, capturePaypalOrder,
} from '../src/lib/billing/gateways';

let passed = 0; let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log('\n── 1. Plan catalog ──');
ok(PLANS.free.priceUsd === 0, 'free = US$0');
ok(PLANS.pro.priceUsd === 149 && PLANS.pro.limits.users === 10, 'pro = US$149 / 10 users');
ok(PLANS.regional.priceUsd === 449, 'regional = US$449');
ok(PLANS.enterprise.priceUsd === 1500, 'enterprise = from US$1,500');
ok(PAID_PLANS.join(',') === 'pro,regional,enterprise', 'paid plans list');
ok(planPriceUsd('regional') === 449, 'planPriceUsd lookup');
ok(planPriceUsd('pro', 99) === 99, 'price override respected (negotiated deals)');
ok(planPriceUsd('unknown_plan') === 0, 'unknown plan falls back to free (safe)');

console.log('\n── 2. Region coverage per plan ──');
ok(planCoversRegion('free', 'TT') && planCoversRegion('pro', 'TT'), 'free/pro cover TT');
ok(planCoversRegion('pro', 'tt'), 'coverage check case-insensitive');
ok(!planCoversRegion('pro', 'JM') && !planCoversRegion('free', 'BB'), 'free/pro do NOT cover JM/BB');
ok(planCoversRegion('regional', 'JM') && planCoversRegion('regional', 'AG') && planCoversRegion('enterprise', 'GY'), 'regional/enterprise cover everything');
ok(planLimits('enterprise').vaultGb === 500, 'enterprise vault 500 GB');

console.log('\n── 3. WiPay adapter (official T&T terms, Oct 2025) ──');
delete process.env.WIPAY_MERCHANT_ID; delete process.env.WIPAY_MD5_KEY;
ok(wipayConfigured() === false, 'unconfigured without env vars → honest manual flow');
process.env.WIPAY_MERCHANT_ID = '1557551339';
process.env.WIPAY_MD5_KEY = 'TESTKEY';
ok(wipayConfigured() === true, 'configured with WIPAY_MERCHANT_ID + WIPAY_MD5_KEY');

// Checksum formula: md5(order_id + merchant + total + currency + key)
const expected = createHash('md5').update('ORD-1' + '1557551339' + '449.00' + 'USD' + 'TESTKEY').digest('hex');
ok(wipayChecksum('ORD-1', '449.00', 'USD') === expected, 'request checksum = md5(order+merchant+total+currency+key)');
const expectedRet = createHash('md5').update('TESTKEY' + 'TX-9' + 'ORD-1' + '449.00').digest('hex');
ok(wipayReturnChecksum('TX-9', 'ORD-1', '449.00') === expectedRet, 'return checksum = md5(key+txn+order+total)');

const ck = buildWipayCheckout({
  orderId: 'ORD-1', total: 449, currency: 'USD',
  returnUrl: 'https://app.example.com/api/billing/wipay/return',
  cancelUrl: 'https://app.example.com/dashboard/billing',
  name: 'Test Broker Ltd', email: 'pay@example.com',
});
ok(ck.url.startsWith(WIPAY_GATEWAY_URL), 'checkout URL points at the WiPay gateway');
ok(ck.fields.order_id === 'ORD-1', 'order_id passed');
ok(ck.fields.total === '449.00', 'total formatted to 2 decimals');
ok(ck.fields.currency === 'USD', 'currency USD');
ok(ck.fields.fee_structure === 'customer_pay', 'fee_structure customer_pay (platform nets full rental)');
ok(ck.fields.md5 === expected, 'md5 checksum embedded in the request');
ok(ck.url.includes('return_url=https%3A%2F%2Fapp.example.com'), 'return URL carried');
delete process.env.WIPAY_MERCHANT_ID; delete process.env.WIPAY_MD5_KEY;

console.log('\n── 4. PayPal adapter (no creds → no fake orders) ──');
delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_CLIENT_SECRET;
ok(paypalConfigured() === false, 'unconfigured without env vars');
process.env.PAYPAL_CLIENT_ID = 'dummy'; process.env.PAYPAL_CLIENT_SECRET = 'dummy';
ok(paypalConfigured() === true, 'configured with client id + secret');
delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_CLIENT_SECRET;

// With bogus credentials against the sandbox the call must THROW (no fake success)
process.env.PAYPAL_CLIENT_ID = 'bogus'; process.env.PAYPAL_CLIENT_SECRET = 'bogus';
let paypalThrew = false;
try {
  await createPaypalOrder({
    orderId: 'PR-TEST', amountUsd: 449, description: 'test',
    returnUrl: 'https://example.com/r', cancelUrl: 'https://example.com/c',
  });
} catch { paypalThrew = true; }
ok(paypalThrew, 'bogus PayPal creds → order creation throws (never fakes success)');
delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_CLIENT_SECRET;

console.log(`\n════════════════════════════════`);
console.log(`RESULTADO: ${passed} pasaron, ${failed} fallaron`);
console.log(`════════════════════════════════\n`);
if (failed > 0) process.exit(1);
