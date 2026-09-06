import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { round2 } from '@/lib/engine/landed-cost';

interface QuoteItem { kind: 'fee' | 'disbursement'; description: string; amount: number }

async function nextNumber(tenantId: string, type: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.quote.count({ where: { tenantId, type } });
  return `${type === 'quote' ? 'QT' : 'IN'}-${year}-${String(count + 1).padStart(4, '0')}`;
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
    const body = await readJson<{ clientId?: string; shipmentId?: string; type?: string; items?: QuoteItem[]; notes?: string; validUntil?: string; dueDate?: string }>(req);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return fail(400, 'MISSING_ITEMS', 'Add at least one fee or disbursement.');

    const type = body.type === 'invoice' ? 'invoice' : 'quote';
    const fees = items.filter(i => i.kind === 'fee');
    const disb = items.filter(i => i.kind === 'disbursement');
    const feesTotal = round2(fees.reduce((s2, i) => s2 + Number(i.amount || 0), 0));
    const disbTotal = round2(disb.reduce((s2, i) => s2 + Number(i.amount || 0), 0));
    // Broker honorarios llevan VAT; disbursements (gastos de terceros) no llevan
    const vatTotal = round2(feesTotal * 0.125);
    const total = round2(feesTotal + disbTotal + vatTotal);

    const quote = await db.quote.create({
      data: {
        tenantId: s.tenantId,
        clientId: body.clientId || null,
        shipmentId: body.shipmentId || null,
        number: await nextNumber(s.tenantId, type),
        type, status: 'draft',
        itemsJson: JSON.stringify(items),
        feesTotal, disbursementsTotal: disbTotal,
        vatRate: 12.5, vatTotal, total,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes || null,
      },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: `quote.created`,
      entityType: 'quote', entityId: quote.id,
      metadata: { number: quote.number, type, total },
    });
    return ok({ quote }, 201);
  } catch (err) { return guardError(err); }
}

/** PATCH — status transitions: draft→sent→approved/paid | rejected */
export async function PATCH(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<{ id: string; status: string }>(req);
    if (!body.id || !body.status) return fail(400, 'MISSING_FIELDS', 'id and status required.');
    const quote = await db.quote.findUnique({ where: { id: body.id } });
    if (!quote) return fail(404, 'NOT_FOUND', 'Quote not found.');
    assertTenantOwns(s.tenantId, quote.tenantId);

    const VALID = ['draft', 'sent', 'approved', 'rejected', 'paid'];
    if (!VALID.includes(body.status)) return fail(400, 'INVALID_STATUS', `Status: ${VALID.join(', ')}`);

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
        title: `${quote.number} enviada al cliente`,
        body: `${quote.type === 'quote' ? 'Cotización' : 'Factura'} por TT$${quote.total.toLocaleString()} enviada para aprobación.`,
      });
    }
    return ok({ quote: updated });
  } catch (err) { return guardError(err); }
}
