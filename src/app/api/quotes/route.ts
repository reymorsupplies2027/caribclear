import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import {
  invoiceTotals, nextFolio, canTransitionQuoteStatus,
  type QuoteItemInput, type FxTableRow,
} from '@/lib/accounting';

async function nextNumber(tenantId: string, type: string): Promise<string> {
  // Scan-based folio (deletion-proof): count() breaks when a row is deleted —
  // count says 5 while QT-...0005 still exists → unique violation. We scan the
  // tenant's own numbers instead and walk past every taken one. Unique is
  // composite [tenantId, number], so two tenants can both own QT-2026-0001.
  const year = new Date().getFullYear();
  const prefix = type === 'quote' ? 'QT' : 'IN';
  const rows = await db.quote.findMany({
    where: { tenantId, type, number: { startsWith: `${prefix}-${year}-` } },
    select: { number: true },
  });
  return nextFolio(rows.map(r => r.number), prefix as 'QT' | 'IN', year);
}

export async function GET(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const quotes = await db.quote.findMany({
      where: { tenantId: s.tenantId },
      include: { client: { select: { id: true, name: true } }, shipment: { select: { reference: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ quotes });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<{
      clientId?: string; shipmentId?: string; type?: string;
      currency?: string;
      items?: Array<QuoteItemInput & { disbursementId?: string }>;
      disbursementIds?: string[];
      notes?: string; validUntil?: string; dueDate?: string;
    }>(req);

    const type = body.type === 'invoice' ? 'invoice' : 'quote';
    const invoiceCurrency = (body.currency || 'TTD').toUpperCase();

    // ── Build the line set ──
    // (a) operator lines: fees or plain disbursement lines
    // (b) real disbursements picked by id: pulled from actual rows, converted
    //     into the invoice currency, and marked billed when this is an invoice.
    const manualItems = (Array.isArray(body.items) ? body.items : []) as QuoteItemInput[];
    const disbursementIds = Array.isArray(body.disbursementIds) ? body.disbursementIds : [];

    let disbursementRows: Awaited<ReturnType<typeof fetchDisbursements>> = [];
    if (disbursementIds.length) {
      if (!body.shipmentId) return fail(400, 'SHIPMENT_REQUIRED', 'Billing disbursements requires the invoice to reference the shipment they belong to.');
      disbursementRows = await fetchDisbursements(s.tenantId, disbursementIds);
      const missing = disbursementIds.filter(id => !disbursementRows.some(d => d.id === id));
      if (missing.length) return fail(404, 'DISBURSEMENT_NOT_FOUND', `Disbursements not found in this tenant: ${missing.join(', ')}`);
      const notBillable = disbursementRows.filter(d => d.status !== 'paid');
      if (notBillable.length) {
        return fail(409, 'NOT_BILLABLE', `Only PAID disbursements can be billed. Not billable: ${notBillable.map(d => d.id).join(', ')}`);
      }
    }

    const disbLines: QuoteItemInput[] = disbursementRows.map(d => ({
      kind: 'disbursement' as const,
      description: `${d.category.replace('_', ' ')}${d.vendorRef ? ` — ${d.vendorRef}` : ''} (shipment outlay)`,
      amount: d.amount,
      currency: d.currency || 'TTD',
      fxRate: d.fxRate ?? null,
      disbursementId: d.id,
    }));

    const items: QuoteItemInput[] = [...manualItems, ...disbLines];
    if (items.length === 0) return fail(400, 'MISSING_ITEMS', 'Add at least one fee or disbursement.');

    // ── FX table for conversions (provenance per converted line) ──
    const fxRows = await db.fxRate.findMany({
      where: { tenantId: s.tenantId },
      orderBy: { asOf: 'desc' },
      take: 500,
    });
    const fxTable: FxTableRow[] = fxRows.map(r => ({
      baseCcy: r.baseCcy, quoteCcy: r.quoteCcy, rate: r.rate, source: r.source, asOf: r.asOf,
    }));

    const totals = invoiceTotals(items, invoiceCurrency, { fxTable, invoiceDate: new Date() });
    if (totals.errors.length && totals.unresolved.length) {
      return fail(422, 'FX_UNRESOLVED', totals.errors.join(' '));
    }
    if (totals.errors.length) return fail(400, 'INVALID_ITEMS', totals.errors.join(' '));

    // Invoice creation with real disbursements → mark them billed (atomic-ish:
    // the quote row is created first, then the links; a failure leaves the
    // disbursements payable again, never lost).
    const number = await nextNumber(s.tenantId, type);
    const quote = await db.quote.create({
      data: {
        tenantId: s.tenantId,
        clientId: body.clientId || null,
        shipmentId: body.shipmentId || null,
        number, type, status: 'draft',
        itemsJson: JSON.stringify(totals.items),
        feesTotal: totals.feesTotal, disbursementsTotal: totals.disbursementsTotal,
        vatRate: 12.5, vatTotal: totals.vatTotal, total: totals.total,
        currency: invoiceCurrency,
        fxDetailJson: JSON.stringify(totals.fxDetail),
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes || null,
      },
    });

    if (type === 'invoice' && disbursementRows.length) {
      await db.disbursement.updateMany({
        where: { id: { in: disbursementRows.map(d => d.id) }, tenantId: s.tenantId },
        data: { status: 'billed', quoteId: quote.id },
      });
    }

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: `${type}.created`,
      entityType: 'quote', entityId: quote.id,
      metadata: {
        number: quote.number, type, total: totals.total, currency: invoiceCurrency,
        fxLines: totals.fxDetail.filter(f => f.provenance !== 'identity').length,
        disbursementsBilled: type === 'invoice' ? disbursementRows.length : 0,
      },
    });
    return ok({ quote, fxDetail: totals.fxDetail, unresolved: totals.unresolved }, 201);
  } catch (err) { return guardError(err); }
}

/** PATCH — status transitions guarded by the state machine (draft→sent→approved/paid | rejected). */
export async function PATCH(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<{ id: string; status: string }>(req);
    if (!body.id || !body.status) return fail(400, 'MISSING_FIELDS', 'id and status required.');
    const quote = await db.quote.findUnique({ where: { id: body.id } });
    if (!quote) return fail(404, 'NOT_FOUND', 'Quote not found.');
    assertTenantOwns(s.tenantId, quote.tenantId);

    if (!canTransitionQuoteStatus(quote.status, body.status)) {
      return fail(409, 'INVALID_TRANSITION', `A ${quote.type} in "${quote.status}" cannot move to "${body.status}".`);
    }

    const updated = await db.quote.update({
      where: { id: body.id },
      data: {
        status: body.status,
        approvedAt: body.status === 'approved' ? new Date() : undefined,
        approvedById: body.status === 'approved' ? s.userId : undefined,
      },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'quote.status_changed',
      entityType: 'quote', entityId: body.id,
      metadata: { number: quote.number, status: { old: quote.status, new: body.status } },
    });
    if (body.status === 'sent' && quote.clientId) {
      const { notify } = await import('@/lib/notify');
      await notify({
        tenantId: s.tenantId, shipmentId: quote.shipmentId, type: 'system',
        title: `${quote.number} sent to client`,
        body: `${quote.type === 'quote' ? 'Quote' : 'Invoice'} for ${quote.currency} ${quote.total.toLocaleString()} sent for approval.`,
      });
    }
    return ok({ quote: updated });
  } catch (err) { return guardError(err); }
}

async function fetchDisbursements(tenantId: string, ids: string[]) {
  return db.disbursement.findMany({
    where: { id: { in: ids }, tenantId },
  });
}
