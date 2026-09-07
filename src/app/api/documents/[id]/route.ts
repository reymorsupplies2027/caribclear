import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { vaultDecrypt } from '@/lib/vault-crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

/** GET — decrypt-and-stream the vault document (AES-256-GCM read path). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireTenant(req);
    const { id } = await params;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) return fail(404, 'NOT_FOUND', 'Document not found.');
    assertTenantOwns(s.tenantId, doc.tenantId);
    if (!doc.storageKey || !doc.fileSize) return fail(409, 'NO_BINARY', 'Metadata-only record — no file stored.');

    const abs = path.join(process.cwd(), 'upload', doc.storageKey);
    let stored: Buffer;
    try { stored = await readFile(abs); }
    catch { return fail(410, 'GONE', 'File missing from vault storage.'); }
    const plain = vaultDecrypt(stored); // real decryption — tampering breaks the GCM tag

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'document.downloaded',
      entityType: 'document', entityId: id, metadata: { title: doc.title },
    });
    return new NextResponse(new Uint8Array(plain), {
      headers: {
        'Content-Type': doc.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${doc.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) { return guardError(err); }
}

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
