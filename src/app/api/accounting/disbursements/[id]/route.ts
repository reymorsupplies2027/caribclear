/**
 * /api/accounting/disbursements/[id] — lifecycle transitions.
 * pending → paid (money leaves the fund; a mirror LedgerEntry is written in
 * the same fund so TRUST/OPERATING balances always reflect reality)
 * paid → billed (it landed on a client invoice)
 * pending → written_off
 * Illegal transitions are rejected 409. No deletes.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { canTransitionDisbursementStatus } from '@/lib/accounting';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff(req);
    const { id } = await ctx.params;
    const body = await readJson<{ status?: string; quoteId?: string }>(req);
    if (!body.status) return fail(400, 'MISSING_FIELDS', 'status is required.');

    const disbursement = await db.disbursement.findUnique({ where: { id } });
    if (!disbursement) return fail(404, 'NOT_FOUND', 'Disbursement not found.');
    assertTenantOwns(s.tenantId, disbursement.tenantId);

    if (!canTransitionDisbursementStatus(disbursement.status, body.status)) {
      return fail(409, 'INVALID_TRANSITION', `A disbursement in "${disbursement.status}" cannot move to "${body.status}".`);
    }

    const now = new Date();
    const updated = await db.disbursement.update({
      where: { id },
      data: {
        status: body.status,
        paidAt: body.status === 'paid' ? now : undefined,
        quoteId: body.status === 'billed' ? (body.quoteId || disbursement.quoteId) : undefined,
      },
    });

    // Mirror the cash movement into the ledger when money actually leaves.
    if (body.status === 'paid') {
      const fund = disbursement.paidFrom === 'operating' ? 'OPERATING' : 'TRUST';
      const category = fund === 'TRUST'
        ? (disbursement.category === 'vat' ? 'vat_paid' : disbursement.category === 'storage' ? 'storage_paid' : 'duty_paid')
        : 'other';
      await db.ledgerEntry.create({
        data: {
          tenantId: s.tenantId,
          shipmentId: disbursement.shipmentId,
          fund, direction: 'out', category,
          amount: disbursement.amount, currency: disbursement.currency,
          fxRate: disbursement.fxRate,
          description: `Disbursement ${disbursement.category}${disbursement.vendorRef ? ` (${disbursement.vendorRef})` : ''}`,
          createdById: s.userId,
        },
      });
    }

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'disbursement.status_changed',
      entityType: 'disbursement', entityId: id,
      metadata: { status: { old: disbursement.status, new: body.status }, amount: disbursement.amount },
    });
    return ok({ disbursement: updated });
  } catch (err) { return guardError(err); }
}
