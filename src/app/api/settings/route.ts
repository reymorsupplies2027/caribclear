import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireBrokerAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
    if (!tenant) return fail(404, 'NOT_FOUND', 'Tenant not found.');
    const users = await db.user.findMany({
      where: { tenantId: s.tenantId, role: { in: ['broker_admin', 'operator'] } },
      select: { id: true, email: true, name: true, role: true, isActive: true, lastLogin: true },
      orderBy: { createdAt: 'asc' },
    });
    const configRow = await db.rateConfig.findFirst({ where: { key: 'engine_snapshot', isActive: true }, orderBy: { version: 'desc' } });
    return ok({ tenant, users, rateConfig: configRow ? JSON.parse(configRow.value) : null, rateConfigVersion: configRow?.version ?? 0 });
  } catch (err) { return guardError(err); }
}

/** PATCH — company profile, FX, plan upgrade (feature flags, no data migration) */
export async function PATCH(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const body = await readJson<Record<string, unknown>>(req);
    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
    if (!tenant) return fail(404, 'NOT_FOUND', 'Tenant not found.');

    const data: Record<string, unknown> = {};
    if ('name' in body) data.name = String(body.name).slice(0, 120);
    if ('primaryColor' in body) data.primaryColor = body.primaryColor || null;
    if ('defaultExchangeRate' in body) data.defaultExchangeRate = Number(body.defaultExchangeRate) || 6.8;

    // Freemium upgrade — instant feature-flag flip
    if ('plan' in body) {
      const plan = String(body.plan);
      if (!['free', 'pro'].includes(plan)) return fail(400, 'INVALID_PLAN', 'Plan must be free|pro.');
      data.plan = plan;
      if (plan === 'pro') data.subscriptionEndsAt = new Date(Date.now() + 365 * 86400000);
    }

    const updated = await db.tenant.update({ where: { id: s.tenantId }, data });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'tenant.settings_updated',
      entityType: 'tenant', entityId: s.tenantId,
      metadata: { fields: Object.keys(data), plan: updated.plan },
    });
    return ok({ tenant: { id: updated.id, plan: updated.plan, defaultExchangeRate: updated.defaultExchangeRate, name: updated.name } });
  } catch (err) { return guardError(err); }
}

/** POST — GDPR-lite data export (JSON snapshot of the tenant's own data) */
export async function POST(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const body = await readJson<{ action: string }>(req);
    if (body.action === 'export_data') {
      const [shipments, clients, quotes, docs, calcs, audit] = await Promise.all([
        db.shipment.findMany({ where: { tenantId: s.tenantId } }),
        db.client.findMany({ where: { tenantId: s.tenantId } }),
        db.quote.findMany({ where: { tenantId: s.tenantId } }),
        db.document.findMany({ where: { tenantId: s.tenantId }, select: { id: true, title: true, type: true, version: true, createdAt: true } }),
        db.costCalculation.findMany({ where: { tenantId: s.tenantId }, select: { id: true, name: true, hsCode: true, totalTtd: true, createdAt: true } }),
        db.auditLog.findMany({ where: { tenantId: s.tenantId }, orderBy: { createdAt: 'asc' }, select: { action: true, entityType: true, createdAt: true, entryHash: true } }),
      ]);
      await appendAuditLog({ tenantId: s.tenantId, userId: s.userId, action: 'gdpr.data_exported', entityType: 'tenant', entityId: s.tenantId });
      return ok({ exportedAt: new Date().toISOString(), shipments, clients, quotes, documents: docs, costCalculations: calcs, auditTrail: audit });
    }
    return fail(400, 'UNKNOWN_ACTION', 'action must be export_data');
  } catch (err) { return guardError(err); }
}
