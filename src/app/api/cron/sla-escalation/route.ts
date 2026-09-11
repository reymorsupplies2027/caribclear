/**
 * CaribClear — CRON: SLA escalation sweep (daily, registered in vercel.json).
 *
 * Multi-tenant sweep: for every active tenant, find shipments sitting in
 * customs too long, quotes awaiting approval too long, and permits stuck in
 * 'pending' — then raise ONE notification per condition per shipment (deduped
 * against unread notifications of the same type for the same shipment, so the
 * daily cron never spams).
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; when the env var is
 * set we verify it. Without the env var the endpoint stays callable (local dev)
 * but the run is clearly labelled as unauthenticated in the response.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Days a shipment may sit in_customs before it escalates (platform-wide SLA bar). */
const IN_CUSTOMS_SLA_DAYS = 7;
/** Days a quote can sit 'sent' without client action before a nudge. */
const QUOTE_STALE_DAYS = 5;
/** Days a permit can sit 'pending' before a nudge. */
const PERMIT_PENDING_DAYS = 7;

function daysSince(d: Date | null | undefined): number {
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get('authorization') || '';
      if (auth !== `Bearer ${secret}`) return fail(401, 'UNAUTHORIZED', 'Cron secret mismatch.');
    }
    const started = Date.now();
    let shipmentsEscalated = 0;
    let quotesNudged = 0;
    let permitsNudged = 0;

    // Tenants sweep — only ACTIVE tenants (cancelled tenants get no nudges).
    const tenants = await db.tenant.findMany({ where: { isActive: true }, select: { id: true, plan: true } });

    for (const t of tenants) {
      // 1) Shipments stuck in customs (order of ops: exclude terminal states).
      const stuck = await db.shipment.findMany({
        where: { tenantId: t.id, status: 'in_customs', closedAt: null, updatedAt: { lt: new Date(Date.now() - IN_CUSTOMS_SLA_DAYS * 86_400_000) } },
        select: { id: true, reference: true, statusNote: true, updatedAt: true },
      });
      for (const sh of stuck) {
        const dup = await db.notification.findFirst({
          where: { tenantId: t.id, shipmentId: sh.id, type: 'sla', title: { contains: sh.reference }, readAt: null },
        });
        if (dup) continue;
        await db.notification.create({
          data: {
            tenantId: t.id, shipmentId: sh.id, type: 'sla', severity: 'warning',
            title: `SLA: ${sh.reference} has been in customs ${daysSince(sh.updatedAt)}+ days`,
            body: `No status movement in over ${IN_CUSTOMS_SLA_DAYS} days. Escalate with the customs division or update the shipment status.`,
          },
        });
        shipmentsEscalated++;
      }

      // 2) Quotes sent but not answered.
      const staleQuotes = await db.quote.findMany({
        where: { tenantId: t.id, type: 'quote', status: 'sent', updatedAt: { lt: new Date(Date.now() - QUOTE_STALE_DAYS * 86_400_000) } },
        select: { id: true, number: true, total: true, currency: true },
      });
      for (const q of staleQuotes) {
        const dup = await db.notification.findFirst({
          where: { tenantId: t.id, type: 'system', title: { contains: q.number }, readAt: null },
        });
        if (dup) continue;
        await db.notification.create({
          data: {
            tenantId: t.id, type: 'system', severity: 'info',
            title: `Quote ${q.number} awaiting client approval for ${QUOTE_STALE_DAYS}+ days`,
            body: `Follow up with the client — ${(q.currency === 'TTD' ? 'TT$' : q.currency + ' ') + q.total.toLocaleString()} is pending their approval.`,
          },
        });
        quotesNudged++;
      }

      // 3) Permits stuck pending.
      const stalePermits = await db.shipmentPermit.findMany({
        where: { status: 'pending', updatedAt: { lt: new Date(Date.now() - PERMIT_PENDING_DAYS * 86_400_000) }, shipment: { tenantId: t.id } },
        include: { shipment: { select: { reference: true } } },
        take: 20,
      });
      for (const p of stalePermits) {
        const dup = await db.notification.findFirst({
          where: { tenantId: t.id, type: 'permit_expiry', title: { contains: p.title }, readAt: null },
        });
        if (dup) continue;
        await db.notification.create({
          data: {
            tenantId: t.id, shipmentId: p.shipmentId, type: 'permit_expiry', severity: 'warning',
            title: `Permit "${p.title}" pending for ${PERMIT_PENDING_DAYS}+ days`,
            body: `Still not submitted for shipment ${p.shipment?.reference || ''}. Check TTBizLink or follow up with the authority.`,
          },
        });
        permitsNudged++;
      }
    }

    return ok({
      sweep: 'sla-escalation',
      authenticated: !!secret,
      tenantsSwept: tenants.length,
      raised: { shipmentsEscalated, quotesNudged, permitsNudged },
      ms: Date.now() - started,
    });
  } catch (err) { return guardError(err); }
}
