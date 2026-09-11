/**
 * CaribClear — CRON: retention report (daily, registered in vercel.json).
 *
 * Customs Act Cap 78:01 requires brokers to keep records for 5 years. This
 * cron produces a NON-DESTRUCTIVE, read-only report: per active tenant, how
 * many shipments/documents have passed their retention window and how many
 * are approaching it (within 6 months). It notifies the platform by writing
 * an audit entry and returns the full report to the caller.
 *
 * Deliberately deletes NOTHING: purging customs records is a legal decision
 * per tenant, executed manually from the platform side with the tenant's
 * written sign-off — automation here would be reckless.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APPROACHING_WINDOW_DAYS = 183; // ~6 months before the 5-year line

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get('authorization') || '';
      if (auth !== `Bearer ${secret}`) return fail(401, 'UNAUTHORIZED', 'Cron secret mismatch.');
    }
    const started = Date.now();
    const now = Date.now();
    const report: Array<{
      tenantId: string; tenantName: string; plan: string;
      shipmentsPastRetention: number; documentsPastRetention: number;
      shipmentsApproaching: number; documentsApproaching: number;
    }> = [];

    const tenants = await db.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true, plan: true, dataRetentionYears: true } });

    for (const t of tenants) {
      const retentionMs = (t.dataRetentionYears || 5) * 365 * 86_400_000;
      const past = new Date(now - retentionMs);
      const approaching = new Date(now - (retentionMs - APPROACHING_WINDOW_DAYS * 86_400_000));

      const [shipmentsPastRetention, documentsPastRetention, shipmentsApproaching, documentsApproaching] = await Promise.all([
        db.shipment.count({ where: { tenantId: t.id, createdAt: { lt: past } } }),
        db.document.count({ where: { tenantId: t.id, createdAt: { lt: past } } }),
        db.shipment.count({ where: { tenantId: t.id, createdAt: { gte: past, lt: approaching } } }),
        db.document.count({ where: { tenantId: t.id, createdAt: { gte: past, lt: approaching } } }),
      ]);

      if (shipmentsPastRetention || documentsPastRetention || shipmentsApproaching || documentsApproaching) {
        report.push({ tenantId: t.id, tenantName: t.name, plan: t.plan, shipmentsPastRetention, documentsPastRetention, shipmentsApproaching, documentsApproaching });
      }
    }

    // Audit the run itself (platform-level, tenantId null) so the sweep is traceable.
    const { appendAuditLog } = await import('@/lib/audit');
    await appendAuditLog({
      tenantId: null, action: 'cron.retention_report', entityType: 'platform', entityId: null,
      metadata: { tenantsFlagged: report.length, generatedAt: new Date().toISOString() },
    }).catch(() => null);

    return ok({
      sweep: 'retention-report',
      authenticated: !!secret,
      policy: `Customs Act Cap 78:01 — ${tenants[0]?.dataRetentionYears ?? 5} years default (per tenant override)`,
      note: 'Read-only report. Nothing was deleted. Purges are manual, per tenant, with written sign-off.',
      tenantsFlagged: report.length,
      report,
      ms: Date.now() - started,
    });
  } catch (err) { return guardError(err); }
}
