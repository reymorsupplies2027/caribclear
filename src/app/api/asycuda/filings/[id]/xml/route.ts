import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { fail, guardError } from '@/lib/api';
import { requireTenant, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { vaultDecrypt } from '@/lib/vault-crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

/**
 * GET /api/asycuda/filings/[id]/xml — decrypt-and-download the generated SAD
 * XML for upload on the administration's ASYCUDA World portal. The stored
 * SHA-256 checksum is re-verified on every download: a tampered file is
 * refused rather than served.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireTenant(req);
    const { id } = await params;
    const filing = await db.customsFiling.findUnique({ where: { id } });
    if (!filing) return fail(404, 'NOT_FOUND', 'Filing not found.');
    assertTenantOwns(s.tenantId, filing.tenantId);
    if (!filing.xmlStorageKey) return fail(409, 'NO_XML', 'No XML generated for this filing yet.');

    const abs = path.join(process.cwd(), 'upload', filing.xmlStorageKey);
    let stored: Buffer;
    try { stored = await readFile(abs); }
    catch { return fail(410, 'GONE', 'XML file missing from vault storage.'); }
    const plain = vaultDecrypt(stored);

    const checksum = crypto.createHash('sha256').update(plain).digest('hex');
    if (filing.xmlChecksum && checksum !== filing.xmlChecksum) {
      return fail(409, 'CHECKSUM_MISMATCH', 'The stored XML does not match its recorded checksum — refusing to serve a tampered declaration.');
    }

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'asycuda.xml_downloaded',
      entityType: 'customs_filing', entityId: id,
      metadata: { country: filing.country, checksum: filing.xmlChecksum },
    });

    const fileName = filing.xmlStorageKey.split('/').pop() || 'SAD.xml';
    return new NextResponse(new Uint8Array(plain), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) { return guardError(err); }
}
