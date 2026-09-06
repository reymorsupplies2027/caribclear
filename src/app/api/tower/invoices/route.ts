import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, guardError, readJson } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { planPriceUsd } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/** GET /api/tower/invoices — platform billing book. */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const status = req.nextUrl.searchParams.get('status') || '';
    const invoices = await db.tenantInvoice.findMany({
      include: { tenant: { select: { id: true, name: true, region: true, city: true, plan: true } } },
      orderBy: { dueDate: 'desc' },
    });
    const filtered = status ? invoices.filter(i => i.status === status) : invoices;
    const now = new Date();
    const rows = filtered.map(i => ({
      ...i,
      // Auto-flag: pending past due is effectively overdue
      effectiveStatus: i.status === 'paid' ? 'paid' : (i.dueDate < now ? 'overdue' : 'pending'),
    }));
    return ok({
      invoices: rows,
      totals: {
        collected: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
        pending: rows.filter(i => i.effectiveStatus === 'pending').reduce((s, i) => s + i.amount, 0),
        overdue: rows.filter(i => i.effectiveStatus === 'overdue').reduce((s, i) => s + i.amount, 0),
      },
    });
  } catch (err) { return guardError(err); }
}

/** POST /api/tower/invoices — generate this month's subscription invoices (idempotent per period). */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin(req);
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const proTenants = await db.tenant.findMany({ where: { plan: 'pro', isActive: true } });

    const created: string[] = [];
    for (const t of proTenants) {
      const exists = await db.tenantInvoice.findFirst({ where: { tenantId: t.id, period } });
      if (exists) continue;
      await db.tenantInvoice.create({
        data: {
          tenantId: t.id, amount: planPriceUsd(t.plan, t.priceUsd), currency: 'USD',
          status: 'pending', period, dueDate: new Date(Date.now() + 15 * 86400000),
        },
      });
      created.push(t.name);
    }
    await appendAuditLog({
      tenantId: null, userId: admin.userId, action: 'tower.invoices_generated',
      entityType: 'billing', metadata: { period, created: created.length, tenants: created },
    });
    return ok({ period, createdCount: created.length, tenants: created });
  } catch (err) { return guardError(err); }
}
