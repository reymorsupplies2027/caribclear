import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { planPriceUsd } from '@/lib/plans';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['sailed', 'in_transit', 'arrived', 'unloaded', 'in_customs'];

/** GET /api/tower/tenants/[id] — full tenant dossier for the landlord. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin(req);
    const { id } = await ctx.params;
    const tenant = await db.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, name: true, role: true, isActive: true, lastLogin: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        invoices: { orderBy: { dueDate: 'desc' } },
        clients: { select: { id: true } },
        documents: { select: { fileSize: true, createdAt: true } },
        costCalcs: { select: { id: true } },
        quotes: { select: { id: true, status: true } },
        shipments: { select: { id: true, reference: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 8 },
      },
    });
    if (!tenant) return fail(404, 'NOT_FOUND', 'Tenant not found.');

    const recentAudit = await db.auditLog.findMany({
      where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 10,
      select: { id: true, action: true, entityType: true, createdAt: true, entryHash: true },
    });

    const activeShipments = tenant.shipments.filter(s => ACTIVE_STATUSES.includes(s.status)).length;
    return ok({
      tenant: {
        id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, priceUsd: tenant.priceUsd,
        region: tenant.region, city: tenant.city, contactEmail: tenant.contactEmail, notes: tenant.notes,
        isActive: tenant.isActive, createdAt: tenant.createdAt, trialEndsAt: tenant.trialEndsAt,
        subscriptionEndsAt: tenant.subscriptionEndsAt, timezone: tenant.timezone,
        defaultExchangeRate: tenant.defaultExchangeRate, onboardingStep: tenant.onboardingStep,
        effectivePriceUsd: planPriceUsd(tenant.plan, tenant.priceUsd),
      },
      stats: {
        users: tenant.users.length, clients: tenant.clients.length,
        shipmentsTotal: tenant.shipments.length > activeShipments ? tenant.shipments.length : undefined,
        activeShipments, documents: tenant.documents.length,
        storageBytes: tenant.documents.reduce((s, d) => s + d.fileSize, 0),
        costCalcs: tenant.costCalcs.length,
        quotes: tenant.quotes.length,
        quotesApproved: tenant.quotes.filter(q => ['approved', 'paid'].includes(q.status)).length,
        mrrUsd: tenant.isActive && tenant.plan === 'pro' ? planPriceUsd(tenant.plan, tenant.priceUsd) : 0,
      },
      users: tenant.users,
      invoices: tenant.invoices,
      recentShipments: tenant.shipments,
      recentAudit,
    });
  } catch (err) { return guardError(err); }
}

/** PATCH /api/tower/tenants/[id] — landlord edits: plan, suspension, region, notes, price. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSuperAdmin(req);
    const { id } = await ctx.params;
    const body = await readJson<{
      plan?: string; isActive?: boolean; region?: string; city?: string;
      contactEmail?: string; notes?: string; priceUsd?: number | null;
    }>(req);

    const tenant = await db.tenant.findUnique({ where: { id } });
    if (!tenant) return fail(404, 'NOT_FOUND', 'Tenant not found.');

    const data: Record<string, unknown> = {};
    for (const k of ['plan', 'isActive', 'region', 'city', 'contactEmail', 'notes'] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.priceUsd !== undefined) data.priceUsd = body.priceUsd === null ? null : Number(body.priceUsd);
    if (body.plan === 'pro') data.subscriptionEndsAt = new Date(Date.now() + 365 * 86400000);

    const updated = await db.tenant.update({ where: { id }, data });
    await appendAuditLog({
      tenantId: null, userId: admin.userId, action: 'tower.tenant_updated',
      entityType: 'tenant', entityId: id,
      metadata: {
        changed: Object.keys(data),
        plan: { old: tenant.plan, new: updated.plan },
        isActive: { old: tenant.isActive, new: updated.isActive },
      },
    });
    return ok({ tenant: { id: updated.id, plan: updated.plan, isActive: updated.isActive, region: updated.region } });
  } catch (err) { return guardError(err); }
}
