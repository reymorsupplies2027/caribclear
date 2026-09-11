/**
 * /api/accounting/disbursements — outlays the broker pays on a client's behalf.
 * GET  — list (optional ?status=&shipmentId=)
 * POST — record an outlay (pending). Paying it (PATCH → paid) is when the
 *        mirror LedgerEntry leaves the fund — never at creation.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['duty', 'vat', 'wharfage', 'delivery_order', 'storage', 'scanning', 'transport', 'other'];
const PAID_FROM = ['trust', 'operating', 'petty_cash', 'company_card'];

export async function GET(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const shipmentId = url.searchParams.get('shipmentId') || undefined;
    const rows = await db.disbursement.findMany({
      where: {
        tenantId: s.tenantId,
        ...(status ? { status } : {}),
        ...(shipmentId ? { shipmentId } : {}),
      },
      include: { shipment: { select: { reference: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ok({ disbursements: rows });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<{
      shipmentId?: string; category: string; amount: number; currency?: string;
      fxRate?: number; paidFrom?: string; vendorRef?: string;
    }>(req);
    if (!body.category || !CATEGORIES.includes(body.category)) {
      return fail(400, 'INVALID_CATEGORY', `Category: ${CATEGORIES.join(', ')}.`);
    }
    const category = body.category;
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, 'INVALID_AMOUNT', 'Amount must be a positive number.');
    if (body.shipmentId) {
      const sh = await db.shipment.findFirst({ where: { id: body.shipmentId, tenantId: s.tenantId }, select: { id: true } });
      if (!sh) return fail(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found in this tenant.');
    }
    const paidFrom = PAID_FROM.includes(body.paidFrom || '') ? body.paidFrom! : 'trust';

    const disbursement = await db.disbursement.create({
      data: {
        tenantId: s.tenantId,
        shipmentId: body.shipmentId || null,
        category, amount,
        currency: body.currency || 'TTD',
        fxRate: body.fxRate ? Number(body.fxRate) : null,
        paidFrom,
        vendorRef: body.vendorRef || null,
        status: 'pending',
      },
      include: { shipment: { select: { reference: true } } },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'disbursement.created',
      entityType: 'disbursement', entityId: disbursement.id,
      metadata: { category, amount, currency: disbursement.currency, paidFrom },
    });
    return ok({ disbursement }, 201);
  } catch (err) { return guardError(err); }
}
