import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DOC_TYPES = ['bl', 'commercial_invoice', 'packing_list', 'permit', 'declaration', 'c2', 'other'];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || undefined;
    const shipmentId = url.searchParams.get('shipmentId') || undefined;
    const docs = await db.document.findMany({
      where: {
        tenantId: s.tenantId, isCurrent: true,
        ...(type && type !== 'all' ? { type } : {}),
        ...(shipmentId ? { shipmentId } : {}),
      },
      include: { shipment: { select: { reference: true } }, uploader: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ documents: docs });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const body = await readJson<{ title: string; type?: string; shipmentId?: string; fileName: string; mimeType?: string; dataBase64?: string; expiryDate?: string; notes?: string; replaceGroupKey?: string }>(req);
    if (!body.title || !body.fileName) return fail(400, 'MISSING_FIELDS', 'Title and file name are required.');

    // Storage: local /upload dir in sandbox; Supabase Storage in prod (storageKey kept uniform)
    let storageKey = `documents/${crypto.randomUUID()}-${body.fileName}`;
    let fileSize = 0;
    if (body.dataBase64) {
      const buf = Buffer.from(body.dataBase64, 'base64');
      if (buf.length > MAX_BYTES) return fail(413, 'TOO_LARGE', 'File exceeds 10MB limit.');
      fileSize = buf.length;
      const abs = path.join(process.cwd(), 'upload', storageKey);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, buf);
    } else {
      fileSize = body.fileName.length; // metadata-only registration
    }

    // Versioning: replaceGroupKey supersedes the current version of that group
    let version = 1;
    let groupKey = crypto.randomUUID();
    if (body.replaceGroupKey) {
      const prev = await db.document.findFirst({
        where: { tenantId: s.tenantId, groupKey: body.replaceGroupKey, isCurrent: true },
        orderBy: { version: 'desc' },
      });
      if (prev) {
        assertTenantOwns(s.tenantId, prev.tenantId);
        await db.document.update({ where: { id: prev.id }, data: { isCurrent: false } });
        groupKey = prev.groupKey;
        version = prev.version + 1;
      }
    }

    const doc = await db.document.create({
      data: {
        tenantId: s.tenantId,
        shipmentId: body.shipmentId || null,
        groupKey, version, isCurrent: true,
        type: DOC_TYPES.includes(body.type || '') ? body.type! : 'other',
        title: body.title, fileName: body.fileName,
        mimeType: body.mimeType || null,
        fileSize, storageKey,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        notes: body.notes || null,
        uploadedById: s.userId,
      },
      include: { shipment: { select: { reference: true } } },
    });

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'document.uploaded',
      entityType: 'document', entityId: doc.id,
      metadata: { title: body.title, type: doc.type, version, shipment: doc.shipment?.reference },
    });
    return ok({ document: doc }, 201);
  } catch (err) { return guardError(err); }
}
