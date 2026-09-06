import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, guardError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { verifyChain } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET /api/tower/health — building integrity: WORM chains, security posture, data volume. */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const deep = req.nextUrl.searchParams.get('deep') === '1';

    const tenants = await db.tenant.findMany({ select: { id: true, name: true, region: true, isActive: true } });
    const chains = await Promise.all(tenants.map(async t => ({ tenant: t, ...(await verifyChain(t.id)) })));
    const platformChain = await verifyChain(null);

    const [auditTotal, audit24h, failedAttempts, locked, userCount, docCount, docBytes, shipmentCount, calcCount, pushSubs] = await Promise.all([
      db.auditLog.count(),
      db.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      db.userSecurity.aggregate({ _sum: { failedLoginAttempts: true } }),
      db.userSecurity.count({ where: { lockedUntil: { gt: new Date() } } }),
      db.user.count(),
      db.document.count(),
      db.document.aggregate({ _sum: { fileSize: true } }),
      db.shipment.count(),
      db.costCalculation.count(),
      db.pushSubscription.count(),
    ]);

    const recent = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' }, take: 15,
      select: { id: true, action: true, entityType: true, tenantId: true, createdAt: true, entryHash: true },
    });

    // Retention law: Customs Act Cap 78:01 — 5 years. Count expired-but-purge-eligible.
    const purgeEligible = await db.document.count({
      where: { createdAt: { lt: new Date(Date.now() - 5 * 365 * 86400000) } },
    });

    return ok({
      chains: {
        platform: { ok: platformChain.ok, checked: platformChain.checked, brokenId: platformChain.brokenId ?? null },
        tenants: chains.map(c => ({ name: c.tenant.name, region: c.tenant.region, isActive: c.tenant.isActive, ok: c.ok, checked: deep ? c.checked : Math.min(c.checked, 50) })),
        allOk: chains.every(c => c.ok) && platformChain.ok,
      },
      security: {
        failedLoginAttemptsTotal: failedAttempts._sum.failedLoginAttempts ?? 0,
        lockedAccountsNow: locked,
        twoFactorNote: 'TOTP enforced per user; lockout escalates 15min → 24h.',
      },
      data: {
        users: userCount, shipments: shipmentCount, documents: docCount,
        storageBytes: docBytes._sum.fileSize ?? 0, costCalculations: calcCount,
        pushSubscriptions: pushSubs, auditEntries: auditTotal, auditEntries24h: audit24h,
        purgeEligibleDocs: purgeEligible,
        retention: 'Customs Act Cap 78:01 — 5 years',
      },
      recentAudit: recent,
    });
  } catch (err) { return guardError(err); }
}
