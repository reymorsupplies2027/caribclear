import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, guardError } from '@/lib/api';
import { requireStaff } from '@/lib/guard';

export const dynamic = 'force-dynamic';

const AT_PORT = ['arrived', 'unloaded', 'in_customs'];

export interface DemurrageRow {
  shipmentId: string; reference: string; clientId: string | null;
  clientName: string | null; containers: string[];
  daysUsed: number; daysLeft: number; exposureTtd: number;
  perDayTtd: number; risk: 'green' | 'amber' | 'red'; status: string;
}

/**
 * GET /api/dashboard/workqueue — the broker's day plan.
 * Execution, not reporting: every row is something to DO today.
 * Also materializes 48h/24h demurrage alerts (idempotent) into the
 * notification center — the "cron" that works even without pg_cron.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireStaff(req);
    const tenantId = session.tenantId;
    const now = Date.now();

    const shipments = await db.shipment.findMany({
      where: { tenantId, status: { in: [...AT_PORT, 'sailed', 'in_transit'] } },
      include: {
        client: { select: { name: true } },
        containers: { select: { number: true, size: true } },
        permits: { select: { id: true, title: true, status: true, expiryDate: true } },
      },
    });
    const [docs, sentQuotes] = await Promise.all([
      db.document.findMany({
        where: { tenantId, expiryDate: { not: null, lte: new Date(now + 30 * 86400000) } },
        select: { id: true, title: true, expiryDate: true },
      }),
      db.quote.findMany({
        where: { tenantId, type: 'quote', status: 'sent' },
        select: { id: true, number: true, total: true, validUntil: true, clientId: true },
      }),
    ]);

    // ── Demurrage clock (the money countdown) ──
    const demurrage: DemurrageRow[] = [];
    const alertOps: { tenantId: string; type: string; severity: string; title: string; body: string; shipmentId: string }[] = [];

    for (const s of shipments) {
      if (!s.demurrageStartDate || s.status === 'sailed' || s.status === 'in_transit') {
        // Not at port yet — but check upcoming ETA arrivals separately below
        continue;
      }
      const daysUsed = Math.floor((now - new Date(s.demurrageStartDate).getTime()) / 86400000);
      const daysLeft = s.demurrageFreeDays - daysUsed;
      const exposureTtd = daysLeft < 0 ? Math.abs(daysLeft) * s.demurragePerDayTtd : 0;
      const risk: DemurrageRow['risk'] = daysLeft <= 2 ? 'red' : daysLeft <= 4 ? 'amber' : 'green';
      demurrage.push({
        shipmentId: s.id, reference: s.reference, clientId: s.clientId,
        clientName: s.client?.name ?? null,
        containers: s.containers.map(c => `${c.number} (${c.size})`),
        daysUsed, daysLeft, exposureTtd,
        perDayTtd: s.demurragePerDayTtd, risk, status: s.status,
      });

      // Materialize 48h/24h alerts once per shipment (type+shipment dedup)
      if (daysLeft === 2 || daysLeft === 1) {
        const type = daysLeft === 2 ? 'demurrage_48' : 'demurrage_24';
        const existing = await db.notification.findFirst({ where: { tenantId, shipmentId: s.id, type } });
        if (!existing) {
          alertOps.push({
            tenantId, type, severity: 'critical',
            title: `Demurrage: ${daysLeft === 2 ? '48h' : '24h'} left — ${s.reference}`,
            body: daysLeft === 2
              ? `Free days end in ~2 days. After that, TT$${s.demurragePerDayTtd}/day per container starts. Expedite the declaration now.`
              : `LAST WARNING: penalties of TT$${s.demurragePerDayTtd}/day start within 24h for ${s.reference}.`,
            shipmentId: s.id,
          });
        }
      }
    }
    demurrage.sort((a, b) => a.daysLeft - b.daysLeft);
    if (alertOps.length) await db.notification.createMany({ data: alertOps });

    // ── Day tasks (execution queue) ──
    const tasks: { kind: string; priority: number; title: string; detail: string; href: string }[] = [];

    for (const d of demurrage) {
      if (d.risk !== 'green') tasks.push({
        kind: 'demurrage', priority: d.daysLeft <= 1 ? 0 : 1,
        title: `Expedite ${d.reference} — ${d.daysLeft <= 0 ? `PENALIZING TT$${d.exposureTtd.toFixed(0)} accrued` : `${d.daysLeft} free day(s) left`}`,
        detail: d.clientName ? `${d.clientName} · ${d.containers.join(', ')}` : d.containers.join(', '),
        href: `/dashboard/shipments/${d.shipmentId}`,
      });
    }

    // Arrivals within 3 days → pre-arrival readiness
    for (const s of shipments) {
      if ((s.status === 'in_transit' || s.status === 'sailed') && s.eta) {
        const daysToEta = Math.ceil((new Date(s.eta).getTime() - now) / 86400000);
        if (daysToEta >= 0 && daysToEta <= 3) {
          const docCount = await db.document.count({ where: { tenantId, shipmentId: s.id } });
          tasks.push({
            kind: 'arrival', priority: 1,
            title: `Arrival in ${daysToEta === 0 ? 'today' : `${daysToEta}d`} — ${s.reference}`,
            detail: docCount === 0
              ? 'No documents in the vault yet — collect BL + invoice BEFORE arrival to clear in 1 day.'
              : `${docCount} document(s) ready. Confirm transport and permits.`,
            href: `/dashboard/shipments/${s.id}`,
          });
        }
      }
      // Stalled in customs > 3 days
      if (s.status === 'in_customs' && s.demurrageStartDate) {
        const daysUsed = Math.floor((now - new Date(s.demurrageStartDate).getTime()) / 86400000);
        if (daysUsed >= 3) {
          tasks.push({
            kind: 'stalled', priority: 1,
            title: `${s.reference} stalled in customs ${daysUsed} days`,
            detail: 'Follow up with the examiner — every extra day burns free days or money.',
            href: `/dashboard/shipments/${s.id}`,
          });
        }
      }
      // Permits needing action
      for (const p of s.permits) {
        if (p.status === 'pending') {
          tasks.push({
            kind: 'permit', priority: 2,
            title: `Permit pending — ${p.title} (${s.reference})`,
            detail: 'Submit on TTBizLink today; late permits = late clearance.',
            href: `/dashboard/shipments/${s.id}`,
          });
        }
        if (p.expiryDate && new Date(p.expiryDate).getTime() - now < 30 * 86400000) {
          tasks.push({
            kind: 'permit_expiry', priority: 2,
            title: `Permit expires ${new Date(p.expiryDate).toISOString().slice(0, 10)} — ${p.title}`,
            detail: `Renew for ${s.reference} or future shipments will stall.`,
            href: `/dashboard/shipments/${s.id}`,
          });
        }
      }
    }

    // Docs expiring
    for (const d of docs) {
      tasks.push({
        kind: 'doc_expiry', priority: 2,
        title: `Document expires ${new Date(d.expiryDate as Date).toISOString().slice(0, 10)} — ${d.title}`,
        detail: 'Upload the renewed version; the vault keeps version history automatically.',
        href: '/dashboard/documents',
      });
    }

    // Quotes awaiting approval
    for (const q of sentQuotes) {
      tasks.push({
        kind: 'quote_followup', priority: 3,
        title: `Follow up ${q.number} — TT$${q.total.toFixed(0)} awaiting client approval`,
        detail: 'Nudge the client in the portal; approved quotes unblock clearance.',
        href: '/dashboard/quotes',
      });
    }

    tasks.sort((a, b) => a.priority - b.priority);

    return ok({
      demurrage,
      tasks,
      summary: {
        redContainers: demurrage.filter(d => d.risk === 'red').length,
        totalExposureTtd: demurrage.reduce((s, d) => s + d.exposureTtd, 0),
        taskCount: tasks.length,
      },
    });
  } catch (err) { return guardError(err); }
}
