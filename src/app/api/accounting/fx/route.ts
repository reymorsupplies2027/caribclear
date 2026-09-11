/**
 * /api/accounting/fx — tenant FX table (replaces hardcoded static rates).
 * Every rate carries its SOURCE (central bank fix, bank desk note) and the
 * as-of date. Quotes/invoices convert lines through this table and cite the
 * row they used — provenance, not vibes.
 * GET  — list (optional ?base=&quote=)
 * POST — upsert one rate for a given asOf date (unique per tenant/pair/day).
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function normalizeCcy(c: string): string {
  return String(c || '').trim().toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const url = new URL(req.url);
    const base = url.searchParams.get('base');
    const quote = url.searchParams.get('quote');
    const rates = await db.fxRate.findMany({
      where: {
        tenantId: s.tenantId,
        ...(base ? { baseCcy: normalizeCcy(base) } : {}),
        ...(quote ? { quoteCcy: normalizeCcy(quote) } : {}),
      },
      orderBy: { asOf: 'desc' },
      take: 200,
    });
    return ok({ rates });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<{ baseCcy: string; quoteCcy: string; rate: number; source: string; asOf?: string }>(req);
    const baseCcy = normalizeCcy(body.baseCcy);
    const quoteCcy = normalizeCcy(body.quoteCcy);
    const rate = Number(body.rate);
    if (!baseCcy || !quoteCcy) return fail(400, 'MISSING_CCY', 'baseCcy and quoteCcy are required.');
    if (baseCcy === quoteCcy) return fail(400, 'SAME_CCY', 'A currency pair needs two different currencies.');
    if (!Number.isFinite(rate) || rate <= 0) return fail(400, 'INVALID_RATE', 'Rate must be a positive number.');
    if (rate > 1_000_000) return fail(400, 'UNREALISTIC_RATE', 'Rate looks wrong — check the pair direction (e.g. USD→TTD 6.80, not TTD→USD 0.147).');
    if (!body.source || !String(body.source).trim()) return fail(400, 'MISSING_SOURCE', 'Every rate needs its source (e.g. "CBTT daily fix 2026-09-10").');
    const asOf = body.asOf ? new Date(body.asOf) : new Date();
    if (Number.isNaN(asOf.getTime())) return fail(400, 'INVALID_DATE', 'asOf must be a valid date.');

    const rateRow = await db.fxRate.upsert({
      where: { tenantId_baseCcy_quoteCcy_asOf: { tenantId: s.tenantId, baseCcy, quoteCcy, asOf } },
      create: { tenantId: s.tenantId, baseCcy, quoteCcy, rate, source: String(body.source).trim(), asOf },
      update: { rate, source: String(body.source).trim() },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'fx.rate_upserted',
      entityType: 'fx_rate', entityId: rateRow.id,
      metadata: { pair: `${baseCcy}→${quoteCcy}`, rate, source: rateRow.source, asOf: asOf.toISOString() },
    });
    return ok({ rate: rateRow }, 201);
  } catch (err) { return guardError(err); }
}
