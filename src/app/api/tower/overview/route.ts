import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, guardError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { verifyChain } from '@/lib/audit';
import { planPriceUsd } from '@/lib/plans';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['sailed', 'in_transit', 'arrived', 'unloaded', 'in_customs'];

/** GET /api/tower/overview — the landlord's dark room dashboard data. */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const [tenants, invoices, shipments, docsExpiring, audit24h, lockedAccounts] = await Promise.all([
      db.tenant.findMany({
        include: {
          users: { select: { id: true, role: true, lastLogin: true, isActive: true } },
          shipments: { select: { id: true, status: true, updatedAt: true, demurrageStartDate: true, demurrageFreeDays: true, demurragePerDayTtd: true } },
          invoices: { select: { amount: true, status: true, paidAt: true, dueDate: true } },
          documents: { select: { id: true } },
        },
      }),
      db.tenantInvoice.findMany({ select: { amount: true, status: true, paidAt: true } }),
      db.shipment.findMany({
        where: { status: { in: ACTIVE_STATUSES } },
        select: { id: true, tenantId: true, status: true, demurrageStartDate: true, demurrageFreeDays: true, demurragePerDayTtd: true, updatedAt: true },
      }),
      db.document.count({ where: { expiryDate: { not: null, lte: new Date(Date.now() + 30 * 86400000) } } }),
      db.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      db.userSecurity.count({ where: { lockedUntil: { gt: new Date() } } }),
    ]);

    // Occupancy by region
    const byRegion: Record<string, { total: number; active: number; pro: number; mrr: number }> = {};
    for (const t of tenants) {
      const r = t.region || 'Trinidad';
      byRegion[r] ??= { total: 0, active: 0, pro: 0, mrr: 0 };
      byRegion[r].total += 1;
      if (t.isActive) byRegion[r].active += 1;
      if (t.plan === 'pro') {
        byRegion[r].pro += 1;
        byRegion[r].mrr += planPriceUsd(t.plan, t.priceUsd);
      }
    }

    const mrr = tenants.filter(t => t.isActive && t.plan === 'pro').reduce((s, t) => s + planPriceUsd(t.plan, t.priceUsd), 0);
    const proCount = tenants.filter(t => t.plan === 'pro').length;
    const freeCount = tenants.filter(t => t.plan === 'free').length;

    // Network congestion index — containers at demurrage risk across ALL tenants
    const now = Date.now();
    let containersAtRisk = 0;
    let exposureTtd = 0;
    for (const s of shipments) {
      if (!s.demurrageStartDate) continue;
      const daysUsed = Math.floor((now - new Date(s.demurrageStartDate).getTime()) / 86400000);
      const daysLeft = s.demurrageFreeDays - daysUsed;
      if (daysLeft <= 2) containersAtRisk += 1;
      if (daysLeft < 0) exposureTtd += Math.abs(daysLeft) * s.demurragePerDayTtd;
    }

    const nowDate = new Date();
    const collectedThisMonth = invoices
      .filter(i => i.status === 'paid' && i.paidAt && i.paidAt.getMonth() === nowDate.getMonth() && i.paidAt.getFullYear() === nowDate.getFullYear())
      .reduce((s, i) => s + i.amount, 0);
    const overdue = invoices.filter(i => i.status === 'overdue' || (i.status === 'pending' && i.dueDate < new Date()));
    const overdueAmount = overdue.reduce((s, i) => s + i.amount, 0);

    // Chain integrity quick check (platform scope + each tenant)
    const chainChecks = await Promise.all(
      tenants.map(async t => ({ tenantId: t.id, name: t.name, ...(await verifyChain(t.id)) })),
    );
    const platformChain = await verifyChain(null);
    const chainBroken = chainChecks.filter(c => !c.ok).length + (platformChain.ok ? 0 : 1);

    return ok({
      kpis: {
        tenants: tenants.length,
        activeTenants: tenants.filter(t => t.isActive).length,
        suspendedTenants: tenants.filter(t => !t.isActive).length,
        users: tenants.reduce((s, t) => s + t.users.length, 0),
        proCount, freeCount,
        conversion: tenants.length ? Math.round((proCount / tenants.length) * 100) : 0,
        mrrUsd: mrr,
        collectedThisMonthUsd: collectedThisMonth,
        overdueCount: overdue.length,
        overdueUsd: overdueAmount,
        shipmentsInNetwork: shipments.length,
        containersAtRisk,
        exposureTtd,
        docsExpiring30: docsExpiring,
        auditEntries24h: audit24h,
        lockedAccounts,
        chainBroken,
      },
      byRegion,
      chainChecks: chainChecks.map(c => ({ name: c.name, ok: c.ok, checked: c.checked })),
      platformChain,
    });
  } catch (err) { return guardError(err); }
}
