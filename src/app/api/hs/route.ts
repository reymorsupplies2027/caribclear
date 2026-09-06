import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant } from '@/lib/guard';

/** GET /api/hs?q=... — search the CET tariff table */
export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const codes = await db.hsCode.findMany({
      where: q ? {
        OR: [
          { code: { contains: q } },
          { description: { contains: q } },
          { chapter: q.padStart(2, '0') },
        ],
      } : {},
      orderBy: { code: 'asc' },
      take: 60,
    });
    const [saved, recent] = await Promise.all([
      db.savedProductRate.findMany({ where: { tenantId: s.tenantId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      db.hsLookup.findMany({ where: { tenantId: s.tenantId }, orderBy: { createdAt: 'desc' }, take: 15 }),
    ]);
    if (q) {
      await db.hsLookup.create({ data: { tenantId: s.tenantId, userId: s.userId, query: q.slice(0, 60), hsCode: codes[0]?.code ?? null } });
    }
    return ok({ codes, saved, recent });
  } catch (err) { return guardError(err); }
}

/** POST /api/hs — save a product rate */
export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const body = await readJson<{ name: string; hsCode: string; notes?: string }>(req);
    if (!body.name || !body.hsCode) return fail(400, 'MISSING_FIELDS', 'Product name and HS code required.');
    const saved = await db.savedProductRate.create({
      data: { tenantId: s.tenantId, name: body.name.slice(0, 120), hsCode: body.hsCode.slice(0, 12), notes: body.notes || null },
    });
    return ok({ saved }, 201);
  } catch (err) { return guardError(err); }
}

/** DELETE /api/hs?id=... — remove saved rate */
export async function DELETE(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return fail(400, 'MISSING_ID', 'id required.');
    const saved = await db.savedProductRate.findUnique({ where: { id } });
    if (saved && saved.tenantId === s.tenantId) {
      await db.savedProductRate.delete({ where: { id } });
    }
    return ok({ deleted: true });
  } catch (err) { return guardError(err); }
}
