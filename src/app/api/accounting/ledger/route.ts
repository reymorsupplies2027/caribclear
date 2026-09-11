/**
 * /api/accounting/ledger — append-only fiduciary ledger.
 * GET  — list entries (optional ?fund=TRUST|OPERATING&shipmentId=&take=)
 * POST — record an entry. No UPDATE, no DELETE anywhere in the app: money
 *        movements are corrected with a reversing entry, never rewritten.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const FUNDS = ['TRUST', 'OPERATING'];
const DIRECTIONS = ['in', 'out'];
const TRUST_CATEGORIES = ['client_deposit', 'duty_paid', 'vat_paid', 'storage_paid', 'refund_to_client', 'other'];
const OPERATING_CATEGORIES = ['fee_income', 'subscription', 'bank_charge', 'petty_cash_topup', 'other'];

export async function GET(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const url = new URL(req.url);
    const fund = url.searchParams.get('fund') || undefined;
    const shipmentId = url.searchParams.get('shipmentId') || undefined;
    const take = Math.min(Number(url.searchParams.get('take')) || 100, 200);
    const entries = await db.ledgerEntry.findMany({
      where: {
        tenantId: s.tenantId,
        ...(fund && FUNDS.includes(fund) ? { fund } : {}),
        ...(shipmentId ? { shipmentId } : {}),
      },
      include: { shipment: { select: { reference: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return ok({ entries });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<{
      fund: string; direction: string; category: string; amount: number;
      currency?: string; fxRate?: number; description: string;
      shipmentId?: string; quoteId?: string;
    }>(req);

    const fund = String(body.fund || '').toUpperCase();
    if (!FUNDS.includes(fund)) return fail(400, 'INVALID_FUND', `Fund must be ${FUNDS.join(' or ')}.`);
    const direction = String(body.direction || '').toLowerCase();
    if (!DIRECTIONS.includes(direction)) return fail(400, 'INVALID_DIRECTION', 'Direction must be in or out.');
    const categories = fund === 'TRUST' ? TRUST_CATEGORIES : OPERATING_CATEGORIES;
    const category = String(body.category || '');
    if (!categories.includes(category)) return fail(400, 'INVALID_CATEGORY', `${fund} categories: ${categories.join(', ')}.`);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, 'INVALID_AMOUNT', 'Amount must be a positive number.');
    if (!body.description || !String(body.description).trim()) return fail(400, 'MISSING_DESCRIPTION', 'A description is required for every ledger entry.');

    // TRUST outflows (money leaving the client's account) require a shipment
    // linkage — that's the audit trail proving whose duties were paid.
    if (fund === 'TRUST' && direction === 'out' && !body.shipmentId) {
      return fail(400, 'SHIPMENT_REQUIRED', 'Trust outflows must reference the shipment they paid for.');
    }
    if (body.shipmentId) {
      const sh = await db.shipment.findFirst({ where: { id: body.shipmentId, tenantId: s.tenantId }, select: { id: true } });
      if (!sh) return fail(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found in this tenant.');
    }

    const entry = await db.ledgerEntry.create({
      data: {
        tenantId: s.tenantId,
        shipmentId: body.shipmentId || null,
        fund, direction, category,
        amount, currency: body.currency || 'TTD',
        fxRate: body.fxRate ? Number(body.fxRate) : null,
        description: String(body.description).trim(),
        quoteId: body.quoteId || null,
        createdById: s.userId,
      },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'ledger.entry_created',
      entityType: 'ledger_entry', entityId: entry.id,
      metadata: { fund, direction, category, amount, currency: entry.currency },
    });
    return ok({ entry }, 201);
  } catch (err) { return guardError(err); }
}
