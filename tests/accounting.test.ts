/**
 * CaribClear — Accounting core test suite (pure functions).
 * Run: bun tests/accounting.test.ts
 * Covers: fiduciary fund separation (TRUST/OPERATING never mixed), FX line
 * resolution (identity/explicit/table both directions + provenance + honest
 * failure), multi-currency invoice totals (VAT on fees only), deletion-proof
 * folios, and the quote/disbursement state machines.
 */
import {
  fundTotals, resolveLineFx, invoiceTotals, nextFolio,
  canTransitionQuoteStatus, canTransitionDisbursementStatus,
  type LedgerLike, type FxTableRow,
} from '../src/lib/accounting';

let passed = 0; let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}
const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

console.log('\n── 1. Fund separation — the fiduciary core ──');
const entries: LedgerLike[] = [
  { fund: 'TRUST', direction: 'in', amount: 24500, currency: 'TTD' },   // client deposit
  { fund: 'TRUST', direction: 'out', amount: 830, currency: 'TTD' },    // duty paid
  { fund: 'TRUST', direction: 'out', amount: 240, currency: 'TTD' },    // storage paid
  { fund: 'OPERATING', direction: 'in', amount: 1450, currency: 'TTD' },// fee income
  { fund: 'OPERATING', direction: 'out', amount: 95, currency: 'TTD' }, // bank charge
];
const t = fundTotals(entries);
ok(t.TRUST.in === 24500 && t.TRUST.out === 1070 && t.TRUST.balance === 23430, 'TRUST: 24,500 in − 1,070 out = 23,430 (client money)');
ok(t.OPERATING.in === 1450 && t.OPERATING.out === 95 && t.OPERATING.balance === 1355, 'OPERATING: 1,450 − 95 = 1,355 (house money)');
ok(t.TRUST.balance + t.OPERATING.balance !== 23430 + 1355 - 1, 'balances are separate sums (nothing was netted)');
ok(!t.foreignFundsFound && !t.mixedCurrencies, 'clean ledger: no foreign funds, single currency');

console.log('\n── 2. Foreign funds never fold into a known bucket ──');
const dirty = fundTotals([
  { fund: 'TRUST', direction: 'in', amount: 100 },
  { fund: 'PETTY_CASH', direction: 'in', amount: 999 },   // garbage fund value
] as LedgerLike[]);
ok(dirty.foreignFundsFound, 'unknown fund value flagged (not silently counted)');
ok(dirty.TRUST.in === 100 && dirty.OPERATING.in === 0, '999 garbage did NOT leak into TRUST or OPERATING');

console.log('\n── 3. FX resolution — identity, explicit, table (both directions) ──');
const FX: FxTableRow[] = [
  { baseCcy: 'USD', quoteCcy: 'TTD', rate: 6.7967, source: 'CBTT daily fix', asOf: '2026-09-10' },
  { baseCcy: 'USD', quoteCcy: 'JMD', rate: 157.12, source: 'BOJ', asOf: '2026-09-10' },
];
// identity: same currency
ok(resolveLineFx({ lineCurrency: 'TTD', invoiceCurrency: 'TTD' })?.rate === 1, 'same currency → rate 1, identity');
// explicit wins over table
const expl = resolveLineFx({ lineCurrency: 'TTD', invoiceCurrency: 'USD', explicitRate: 0.15, fxTable: FX });
ok(expl?.provenance === 'explicit' && close(expl.rate, 0.15), 'operator-pinned rate wins');
// table INVERSE direction: line TTD → invoice USD, table stores USD→TTD
const inv = resolveLineFx({ lineCurrency: 'TTD', invoiceCurrency: 'USD', fxTable: FX });
ok(inv !== null && close(inv.rate, 1 / 6.7967, 1e-6), `line TTD → invoice USD uses 1/6.7967 (inverse row) — got ${inv?.rate}`);
ok(inv?.source.includes('inverted') === true, 'inverse usage is documented in the source label');
// table DIRECT direction: line USD → invoice TTD
const dir = resolveLineFx({ lineCurrency: 'USD', invoiceCurrency: 'TTD', fxTable: FX });
ok(dir !== null && close(dir.rate, 6.7967, 1e-6), `line USD → invoice TTD uses 6.7967 directly — got ${dir?.rate}`);
ok(dir?.provenance === 'table' && dir.source.includes('CBTT'), 'table provenance carries the central-bank source');
// honest failure: missing pair → null, NEVER an invented rate
ok(resolveLineFx({ lineCurrency: 'EUR', invoiceCurrency: 'TTD', fxTable: FX }) === null, 'missing pair → unresolved (null), no invented rate');
// asOf: future-dated rows are ineligible
const futureOnly: FxTableRow[] = [{ baseCcy: 'USD', quoteCcy: 'TTD', rate: 9.99, source: 'future fix', asOf: '2099-01-01' }];
ok(resolveLineFx({ lineCurrency: 'USD', invoiceCurrency: 'TTD', fxTable: futureOnly, invoiceDate: '2026-09-11' }) === null, 'rate dated in the future of the invoice is not used');
// latest asOf ≤ invoice date wins
const hist: FxTableRow[] = [
  { baseCcy: 'USD', quoteCcy: 'TTD', rate: 6.80, source: 'fix Sep-09', asOf: '2026-09-09' },
  { baseCcy: 'USD', quoteCcy: 'TTD', rate: 6.7967, source: 'fix Sep-10', asOf: '2026-09-10' },
];
ok(resolveLineFx({ lineCurrency: 'USD', invoiceCurrency: 'TTD', fxTable: hist, invoiceDate: '2026-09-11' })?.rate === 6.7967, 'latest eligible rate wins (Sep-10 over Sep-09)');

console.log('\n── 4. Invoice totals — multi-currency, VAT on fees only ──');
const inv1 = invoiceTotals([
  { kind: 'fee', description: 'Clearance fee', amount: 1450, currency: 'TTD' },
  { kind: 'disbursement', description: 'Delivery order', amount: 300, currency: 'TTD' },
], 'TTD');
ok(inv1.feesTotal === 1450 && inv1.disbursementsTotal === 300, 'TTD invoice adds up');
ok(inv1.vatTotal === 181.25, 'VAT 12.5% on fees ONLY: 1450 × 0.125 = 181.25');
ok(inv1.total === 1931.25, 'total = fees + disb + vat');
ok(inv1.unresolved.length === 0 && inv1.errors.length === 0, 'no errors on clean invoice');
// VAT never touches disbursements even at scale
const inv2 = invoiceTotals([
  { kind: 'fee', description: 'Fee', amount: 100, currency: 'USD' },
  { kind: 'disbursement', description: 'Duty', amount: 67967, currency: 'TTD' },
], 'USD', { fxTable: FX });
ok(close(inv2.disbursementsTotal, 67967 / 6.7967, 0.01), 'TTD outlay converts to USD via inverse rate');
ok(close(inv2.vatTotal, 12.5, 0.01), 'VAT applies to the 100 USD fee only — the big duty outlay is NOT re-taxed');
// fxDetail provenance per converted line
ok(inv2.fxDetail.length === 2, 'every line has an fxDetail row');
ok(inv2.fxDetail.some(f => f.provenance === 'identity') && inv2.fxDetail.some(f => f.provenance === 'table'), 'provenance: identity + table recorded');
// unresolved line blocks the invoice honestly
const inv3 = invoiceTotals([{ kind: 'fee', description: 'Fee', amount: 100, currency: 'EUR' }], 'TTD', { fxTable: FX });
ok(inv3.unresolved.length === 1 && inv3.errors.length > 0, 'unconvertible line → unresolved + error (caller refuses to guess)');
// negative amounts rejected
const inv4 = invoiceTotals([{ kind: 'fee', description: 'Bad', amount: -50 }], 'TTD');
ok(inv4.errors.some(e => e.includes('negative')), 'negative amounts rejected');

console.log('\n── 5. Folio generator — deletion-proof ──');
ok(nextFolio([], 'QT', 2026) === 'QT-2026-0001', 'empty ledger → 0001');
ok(nextFolio(['QT-2026-0001'], 'QT', 2026) === 'QT-2026-0002', 'sequential');
// THE case count() gets wrong: #0001 and #0003 exist → count() returns 2,
// count-based folio says 0003 → COLLISION with the existing row. The scan
// returns the first FREE number (fills the gap) — never a taken one.
ok(nextFolio(['QT-2026-0001', 'QT-2026-0003'], 'QT', 2026) === 'QT-2026-0002', 'gap in sequence: fills the first FREE slot (count() would collide on #0003 here)');
ok(nextFolio(['QT-2026-0001', 'QT-2026-0002', 'QT-2026-0003', 'QT-2026-0004', 'QT-2026-0006'], 'QT', 2026) === 'QT-2026-0005', 'multi-gap scan: fills the gap before #0006');
ok(nextFolio(['QT-2025-0009'], 'QT', 2026) === 'QT-2026-0001', 'folio is per-year: last year numbers do not block');
ok(nextFolio(['IN-2026-0001'], 'IN', 2026) === 'IN-2026-0002', 'IN prefix independent of QT');

console.log('\n── 6. Quote state machine ──');
ok(canTransitionQuoteStatus('draft', 'sent'), 'draft → sent');
ok(!canTransitionQuoteStatus('draft', 'approved'), 'draft → approved FORBIDDEN (approval must follow a sent quote)');
ok(canTransitionQuoteStatus('sent', 'approved') && canTransitionQuoteStatus('sent', 'rejected'), 'sent → approved | rejected');
ok(!canTransitionQuoteStatus('sent', 'paid'), 'sent → paid FORBIDDEN (money follows approval)');
ok(canTransitionQuoteStatus('approved', 'paid'), 'approved → paid');
ok(!canTransitionQuoteStatus('sent', 'draft'), 'sent → draft FORBIDDEN (no un-sending)');
ok(!canTransitionQuoteStatus('rejected', 'sent') && !canTransitionQuoteStatus('paid', 'anything') , 'rejected/paid are terminal');
ok(!canTransitionQuoteStatus('unknown_state', 'sent'), 'unknown source state never transitions');

console.log('\n── 7. Disbursement state machine ──');
ok(canTransitionDisbursementStatus('pending', 'paid'), 'pending → paid');
ok(canTransitionDisbursementStatus('pending', 'written_off'), 'pending → written_off');
ok(!canTransitionDisbursementStatus('pending', 'billed'), 'pending → billed FORBIDDEN (never bill money you have not paid)');
ok(canTransitionDisbursementStatus('paid', 'billed'), 'paid → billed');
ok(!canTransitionDisbursementStatus('billed', 'paid'), 'billed is terminal');
ok(!canTransitionDisbursementStatus('written_off', 'paid'), 'written_off is terminal');

console.log('\n── 8. Rounding hygiene ──');
const inv5 = invoiceTotals([
  { kind: 'fee', description: 'a', amount: 0.1, currency: 'TTD' },
  { kind: 'fee', description: 'b', amount: 0.2, currency: 'TTD' },
], 'TTD');
ok(inv5.feesTotal === 0.3, '0.1 + 0.2 rounds to exactly 0.3 (no float dust)');

console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
if (failed > 0) process.exit(1);
