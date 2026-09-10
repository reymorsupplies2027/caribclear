import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

/**
 * Importer client portal API.
 * Security: the session role must be 'importer' and every query is
 * scoped to the client record linked to the user (clientId) — an importer
 * can NEVER see another client's data, even inside the same tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    if (s.role !== 'importer' || !s.clientId) return fail(403, 'FORBIDDEN', 'Portal access is for importer accounts.');
    const client = await db.client.findUnique({ where: { id: s.clientId } });
    if (!client) return fail(404, 'NOT_FOUND', 'Client record missing.');
    assertTenantOwns(s.tenantId, client.tenantId);

    const [shipments, quotes, documents] = await Promise.all([
      db.shipment.findMany({
        where: { clientId: client.id },
        include: { containers: true, documents: { where: { isCurrent: true }, select: { id: true, title: true, type: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.quote.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' } }),
      db.document.findMany({
        where: { tenantId: s.tenantId, shipment: { clientId: client.id }, isCurrent: true },
        include: { shipment: { select: { reference: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return ok({ client, shipments, quotes, documents });
  } catch (err) { return guardError(err); }
}

/** POST — importer approves a quote in one click */
export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    if (s.role !== 'importer' || !s.clientId) return fail(403, 'FORBIDDEN', 'Portal access is for importer accounts.');
    const { quoteId } = await readJson<{ quoteId: string }>(req);
    if (!quoteId) return fail(400, 'MISSING_FIELDS', 'quoteId required.');

    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) return fail(404, 'NOT_FOUND', 'Quote not found.');
    assertTenantOwns(s.tenantId, quote.tenantId);
    if (quote.clientId !== s.clientId) return fail(403, 'FORBIDDEN', 'This quote belongs to another client.');
    if (quote.status !== 'sent') return fail(409, 'NOT_APPROVABLE', `Only quotes in "sent" state can be approved (current: ${quote.status}).`);

    const updated = await db.quote.update({
      where: { id: quoteId },
      data: { status: 'approved', approvedAt: new Date(), approvedById: s.userId },
    });

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'quote.approved_by_client',
      entityType: 'quote', entityId: quoteId,
      metadata: { number: quote.number, approvedByClient: s.clientId },
    });

    // Real-time-ish notification to the broker staff
    const { notify } = await import('@/lib/notify');
    await notify({
      tenantId: s.tenantId, shipmentId: quote.shipmentId, type: 'quote_approved', severity: 'info',
      title: `${quote.number} approved by ${s.name}`,
      body: `The client approved TT$${quote.total.toLocaleString()}. Generate the invoice or move the operation forward.`,
    });

    return ok({ quote: updated });
  } catch (err) { return guardError(err); }
}
