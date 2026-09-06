import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** PATCH /api/tower/invoices/[id] — mark invoice paid / pending / overdue. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSuperAdmin(req);
    const { id } = await ctx.params;
    const body = await readJson<{ status?: string }>(req);
    if (!body.status || !['paid', 'pending', 'overdue'].includes(body.status)) {
      return fail(400, 'INVALID_STATUS', 'status must be paid | pending | overdue.');
    }
    const inv = await db.tenantInvoice.findUnique({ where: { id }, include: { tenant: { select: { name: true } } } });
    if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found.');

    const updated = await db.tenantInvoice.update({
      where: { id },
      data: { status: body.status, ...(body.status === 'paid' ? { paidAt: new Date() } : { paidAt: null }) },
    });
    await appendAuditLog({
      tenantId: null, userId: admin.userId, action: 'tower.invoice_status_changed',
      entityType: 'invoice', entityId: id,
      metadata: { tenant: inv.tenant.name, status: { old: inv.status, new: updated.status }, amount: inv.amount },
    });
    return ok({ invoice: { id: updated.id, status: updated.status, paidAt: updated.paidAt } });
  } catch (err) { return guardError(err); }
}
