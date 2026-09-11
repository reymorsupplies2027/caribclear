/**
 * CaribClear — Accounting core (pure, DB-free, fully unit-tested).
 *
 * The fiduciary rule this module exists to enforce: money held for CLIENTS
 * (TRUST) and the broker's own money (OPERATING) are never mixed — not in
 * the totals, not in the UI, not in the ledger. Every function here is pure
 * so tests can hammer the arithmetic without a database.
 *
 * FX design: quotes/invoices may carry lines in any currency; everything is
 * converted into the invoice currency with an AUDITABLE rate — every
 * converted line records the rate, its source (bank/central-bank fix) and
 * the as-of date into fxDetailJson. No silent conversions.
 */
import { round2 } from '@/lib/engine/landed-cost';

export type Fund = 'TRUST' | 'OPERATING';
export type LedgerDirection = 'in' | 'out';

export interface LedgerLike {
  id?: string;
  fund: string;          // 'TRUST' | 'OPERATING' (string at rest; validated here)
  direction: string;     // 'in' | 'out'
  amount: number;
  currency?: string;
}

export interface FundBalance {
  in: number;
  out: number;
  balance: number;       // in − out, always ≥ 0 for a healthy TRUST account
}

export interface FundTotals {
  TRUST: FundBalance;
  OPERATING: FundBalance;
  /** true when an entry had a fund value that is neither TRUST nor OPERATING — caller must reject upstream */
  foreignFundsFound: boolean;
  /** true when any entry currency differs from the others (fund view assumes one presentation currency) */
  mixedCurrencies: boolean;
}

/**
 * Totals per fund. Never mixes: TRUST balance is client money liability;
 * OPERATING balance is house money. Unknown fund values never fold into a
 * known bucket — they surface in foreignFundsFound so callers can hard-fail.
 */
export function fundTotals(entries: LedgerLike[]): FundTotals {
  const empty = (): FundBalance => ({ in: 0, out: 0, balance: 0 });
  const t = empty();
  const o = empty();
  let foreign = false;
  const currencies = new Set<string>();
  for (const e of entries) {
    const amt = Number(e.amount) || 0;
    if (e.currency) currencies.add(e.currency);
    if (e.fund === 'TRUST') {
      if (e.direction === 'in') t.in += amt; else t.out += amt;
    } else if (e.fund === 'OPERATING') {
      if (e.direction === 'in') o.in += amt; else o.out += amt;
    } else {
      foreign = true;
    }
  }
  t.in = round2(t.in); t.out = round2(t.out); t.balance = round2(t.in - t.out);
  o.in = round2(o.in); o.out = round2(o.out); o.balance = round2(o.in - o.out);
  return { TRUST: t, OPERATING: o, foreignFundsFound: foreign, mixedCurrencies: currencies.size > 1 };
}

// ─── FX resolution ──────────────────────────────────────────────────────────

export interface FxTableRow {
  baseCcy: string;   // USD
  quoteCcy: string;  // TTD
  rate: number;      // 6.7967 TTD per USD
  source: string;    // 'CBTT daily fix 2026-09-10'
  asOf: Date | string;
}

export interface FxResolution {
  rate: number;
  source: string;
  asOf: string | null;
  provenance: 'explicit' | 'table' | 'identity';
}

/**
 * Resolve the FX rate for one invoice line: how many INVOICE-currency units
 * one LINE-currency unit is worth (line→invoice multiplier).
 *
 * The FxRate table stores rows as base→quote (e.g. base=USD quote=TTD
 * rate=6.7967 means 1 USD = 6.7967 TTD — the direction central banks publish).
 *
 * Conversions:
 *  - Row where base = LINE ccy, quote = INVOICE ccy  → multiply by row.rate
 *    (unusual direction, but allowed if a tenant records it that way).
 *  - Row where base = INVOICE ccy, quote = LINE ccy  → multiply by 1/row.rate
 *    (the common case: table stores USD→TTD, line is TTD, invoice is USD).
 *
 * Precedence (documented for the audit trail):
 *  1. identity — line currency == invoice currency (rate 1)
 *  2. explicit — the operator pinned a rate on the line (fxRate > 0)
 *  3. table    — the tenant's FxRate table, latest asOf ≤ invoice date
 *  4. otherwise the line is UNRESOLVED → null (caller must surface it, never guess)
 */
export function resolveLineFx(opts: {
  lineCurrency: string;
  invoiceCurrency: string;
  explicitRate?: number | null;
  fxTable?: FxTableRow[];
  invoiceDate?: Date | string;
}): FxResolution | null {
  const { lineCurrency, invoiceCurrency } = opts;
  const line = (lineCurrency || invoiceCurrency).toUpperCase();
  const base = (invoiceCurrency || 'TTD').toUpperCase();

  if (line === base) return { rate: 1, source: 'same currency', asOf: null, provenance: 'identity' };
  if (opts.explicitRate && opts.explicitRate > 0) {
    return { rate: opts.explicitRate, source: 'operator-pinned', asOf: null, provenance: 'explicit' };
  }

  const table = opts.fxTable || [];
  const asOfTime = opts.invoiceDate ? new Date(opts.invoiceDate).getTime() : Date.now();
  const eligible = table
    .filter((r) => (r.rate > 0))
    .filter((r) => {
      const b = r.baseCcy.toUpperCase(), q = r.quoteCcy.toUpperCase();
      // Direct row: base=LINE, quote=INVOICE → row.rate multiplies.
      if (b === line && q === base) return true;
      // Inverse row: base=INVOICE, quote=LINE → 1/row.rate.
      if (b === base && q === line) return true;
      return false;
    })
    .filter((r) => new Date(r.asOf).getTime() <= asOfTime)
    .sort((a, b) => new Date(b.asOf).getTime() - new Date(a.asOf).getTime());

  const row = eligible[0];
  if (!row) return null; // unresolved — honest failure, no invented rate
  const b = row.baseCcy.toUpperCase(), q = row.quoteCcy.toUpperCase();
  const inverted = b === base && q === line; // row speaks invoice→line; flip it
  return {
    rate: inverted ? 1 / row.rate : row.rate,
    source: inverted ? `${row.source} (inverted ${row.baseCcy}→${row.quoteCcy})` : row.source,
    asOf: new Date(row.asOf).toISOString(),
    provenance: 'table',
  };
}

// ─── Invoice totals (multi-currency) ────────────────────────────────────────

export interface QuoteItemInput {
  kind: 'fee' | 'disbursement';
  description: string;
  amount: number;          // amount in the LINE's own currency
  currency?: string;       // line currency; defaults to invoice currency
  fxRate?: number | null;  // operator-pinned rate (line ccy → invoice ccy)
  disbursementId?: string; // when the line bills a real Disbursement row
}

export interface FxDetail {
  itemIndex: number;
  currency: string;
  fxRate: number;
  amountLineCcy: number;
  amountInvoiceCcy: number;
  source: string;
  asOf: string | null;
  provenance: FxResolution['provenance'];
}

export interface InvoiceTotalsResult {
  feesTotal: number;          // invoice ccy
  disbursementsTotal: number; // invoice ccy
  vatTotal: number;           // VAT on FEES only (disbursements are pass-through outlays, never VATed)
  total: number;              // invoice ccy
  items: Array<QuoteItemInput & { amountInvoiceCcy: number }>;
  fxDetail: FxDetail[];
  unresolved: Array<{ itemIndex: number; currency: string }>; // lines with no resolvable rate
  errors: string[];
}

/**
 * Compute invoice totals in ONE currency from possibly-mixed-currency lines.
 * VAT applies to broker fees only — duty/VAT/port outlays (disbursements)
 * are collected on behalf of third parties and are never re-taxed.
 */
export function invoiceTotals(
  items: QuoteItemInput[],
  invoiceCurrency: string,
  opts?: { vatRate?: number; fxTable?: FxTableRow[]; invoiceDate?: Date | string },
): InvoiceTotalsResult {
  const vatRate = opts?.vatRate ?? 12.5;
  const out: InvoiceTotalsResult = {
    feesTotal: 0, disbursementsTotal: 0, vatTotal: 0, total: 0,
    items: [], fxDetail: [], unresolved: [], errors: [],
  };

  items.forEach((item, i) => {
    const amount = Number(item.amount) || 0;
    if (amount < 0) out.errors.push(`Item ${i + 1}: negative amounts are not allowed.`);
    if (item.kind !== 'fee' && item.kind !== 'disbursement') out.errors.push(`Item ${i + 1}: kind must be fee or disbursement.`);
    const lineCcy = (item.currency || invoiceCurrency).toUpperCase();

    // Invert semantics: explicitRate is line→invoice. resolveLineFx treats
    // explicit as "rate applied to line to get invoice amount" — which is
    // line→invoice — so pass it straight through.
    const res = resolveLineFx({
      lineCurrency: lineCcy,
      invoiceCurrency,
      explicitRate: item.fxRate ?? null,
      fxTable: opts?.fxTable,
      invoiceDate: opts?.invoiceDate,
    });

    if (!res) {
      out.unresolved.push({ itemIndex: i, currency: lineCcy });
      return;
    }
    const amountInvoiceCcy = round2(amount * res.rate);
    if (item.kind === 'fee') out.feesTotal += amountInvoiceCcy;
    else out.disbursementsTotal += amountInvoiceCcy;

    out.items.push({ ...item, amountInvoiceCcy });
    out.fxDetail.push({
      itemIndex: i,
      currency: lineCcy,
      fxRate: res.rate,
      amountLineCcy: amount,
      amountInvoiceCcy,
      source: res.source,
      asOf: res.asOf,
      provenance: res.provenance,
    });
  });

  if (out.unresolved.length) {
    out.errors.push(
      `No FX rate on file to convert: ${out.unresolved.map(u => u.currency).join(', ')} → ${invoiceCurrency}. Add the rate in Accounting → FX rates (with its source) or pin a rate on the line.`,
    );
  }

  out.feesTotal = round2(out.feesTotal);
  out.disbursementsTotal = round2(out.disbursementsTotal);
  out.vatTotal = round2(out.feesTotal * (vatRate / 100));
  out.total = round2(out.feesTotal + out.disbursementsTotal + out.vatTotal);
  return out;
}

// ─── Folio generator (collision-proof against deletions) ────────────────────

/**
 * Next folio QT-YYYY-NNNN / IN-YYYY-NNNN.
 * Count-based folios break the moment a row is deleted (count 5, but
 * QT-...0005 still exists → unique violation → create fails). This scans the
 * tenant's OWN existing numbers and walks past every taken one.
 */
export function nextFolio(existingNumbers: string[], prefix: 'QT' | 'IN', year: number): string {
  const taken = new Set(existingNumbers);
  let n = 0;
  let candidate = '';
  do {
    n += 1;
    candidate = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  } while (taken.has(candidate));
  return candidate;
}

// ─── Quote/invoice state machine ────────────────────────────────────────────

export const QUOTE_STATUS_FLOW: Record<string, string[]> = {
  draft: ['sent'],                 // a draft is never directly approved/paid
  sent: ['approved', 'rejected'],  // the client decides
  approved: ['paid'],              // money arrives
  rejected: [],                    // terminal — clone it as a new draft instead
  paid: [],                        // terminal
};

export function canTransitionQuoteStatus(from: string, to: string): boolean {
  return (QUOTE_STATUS_FLOW[from] || []).includes(to);
}

export const DISBURSEMENT_STATUS_FLOW: Record<string, string[]> = {
  pending: ['paid', 'written_off'],
  paid: ['billed'],                // money left the fund → can be billed to a client invoice
  billed: [],                      // terminal — it's on an invoice
  written_off: [],                 // terminal
};

export function canTransitionDisbursementStatus(from: string, to: string): boolean {
  return (DISBURSEMENT_STATUS_FLOW[from] || []).includes(to);
}
