import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireTenant(req);
    const { id } = await params;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) return fail(404, 'NOT_FOUND', 'Document not found.');
    assertTenantOwns(s.tenantId, doc.tenantId);

    const body = await readJson<{ title?: string; expiryDate?: string | null; notes?: string | null; shipmentId?: string | null }>(req);
    const data: Record<string, unknown> = {};
    if ('title' in body) data.title = body.title;
    if ('expiryDate' in body) data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
    if ('notes' in body) data.notes = body.notes;
    if ('shipmentId' in body) data.shipmentId = body.shipmentId || null;

    const updated = await db.document.update({ where: { id }, data });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'document.updated',
      entityType: 'document', entityId: id, metadata: { fields: Object.keys(data) },
    });
    return ok({ document: updated });
  } catch (err) { return guardError(err); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireTenant(req);
    const { id } = await params;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) return fail(404, 'NOT_FOUND', 'Document not found.');
    assertTenantOwns(s.tenantId, doc.tenantId);
    // Vault retention: soft-delete keeps the audit trail; hard purge via retention cron
    await db.document.update({ where: { id }, data: { isCurrent: false } });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'document.deleted',
      entityType: 'document', entityId: id, metadata: { title: doc.title },
    });
    return ok({ deleted: true });
  } catch (err) { return guardError(err); }
}
