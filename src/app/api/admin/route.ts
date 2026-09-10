import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

/** GET /api/admin — platform stats + tenant list (super_admin only) */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const [tenantCount, userCount, shipmentCount, auditCount] = await Promise.all([
      db.tenant.count(), db.user.count(), db.shipment.count(), db.auditLog.count(),
    ]);
    const tenants = await db.tenant.findMany({
      include: {
        users: { select: { id: true, role: true } },
        shipments: { select: { id: true, status: true } },
        invoices: { orderBy: { dueDate: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ok({
      stats: { tenantCount, userCount, shipmentCount, auditCount },
      tenants: tenants.map(t => ({
        id: t.id, name: t.name, slug: t.slug, plan: t.plan, isActive: t.isActive,
        createdAt: t.createdAt, trialEndsAt: t.trialEndsAt,
        users: t.users.length, shipments: t.shipments.length,
        activeShipments: t.shipments.filter(s2 => s2.status !== 'released').length,
        lastInvoice: t.invoices[0] ?? null,
      })),
    });
  } catch (err) { return guardError(err); }
}

/** PATCH /api/admin — change tenant plan / suspend (feature flags flip instantly) */
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin(req);
    const body = await readJson<{ tenantId: string; plan?: string; isActive?: boolean }>(req);
    if (!body.tenantId) return fail(400, 'MISSING_FIELDS', 'tenantId required.');
    const tenant = await db.tenant.findUnique({ where: { id: body.tenantId } });
    if (!tenant) return fail(404, 'NOT_FOUND', 'Tenant not found.');

    const updated = await db.tenant.update({
      where: { id: body.tenantId },
      data: {
        ...(body.plan ? { plan: body.plan } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.plan && ['pro', 'regional', 'enterprise'].includes(body.plan) ? { subscriptionEndsAt: new Date(Date.now() + 365 * 86400000) } : {}),
      },
    });
    await appendAuditLog({
      tenantId: null, userId: admin.userId, action: 'admin.tenant_updated',
      entityType: 'tenant', entityId: body.tenantId,
      metadata: { plan: { old: tenant.plan, new: updated.plan }, isActive: updated.isActive },
    });
    return ok({ tenant: { id: updated.id, plan: updated.plan, isActive: updated.isActive } });
  } catch (err) { return guardError(err); }
}
