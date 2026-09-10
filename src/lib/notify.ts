/**
 * CaribClear — Notification service.
 * In-app notifications always persist. WhatsApp/email go through channel
 * adapters that are no-ops until credentials are configured (fail-safe).
 */
import { Notification } from '@prisma/client';
import { appendAuditLog } from '@/lib/audit';

export interface NotifyInput {
  tenantId: string;
  userId?: string | null;
  type: string;      // missing_docs | eta | demurrage | permit_expiry | quote_approved | system
  severity?: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  shipmentId?: string | null;
  channels?: Array<'in_app' | 'whatsapp' | 'email'>;
}

async function sendWhatsApp(_to: string, _body: string): Promise<boolean> {
  // Adapter stub — wire Twilio WhatsApp API here when credentials exist.
  return false;
}
async function sendEmail(_to: string, _subject: string, _body: string): Promise<boolean> {
  // Adapter stub — wire Resend/SMTP here when credentials exist.
  return false;
}

export async function notify(input: NotifyInput): Promise<Notification[]> {
  const { db } = await import('@/lib/db');
  const created: Notification[] = [];
  const channels = input.channels ?? ['in_app'];

  for (const channel of channels) {
    const n = await db.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        type: input.type,
        severity: input.severity ?? 'info',
        title: input.title,
        body: input.body,
        channel,
        shipmentId: input.shipmentId ?? null,
      },
    });
    if (channel === 'in_app') created.push(n);
    // External delivery happens out-of-band; persistence is the source of truth.
  }

  await appendAuditLog({
    tenantId: input.tenantId, action: 'notification.created',
    entityType: 'notification', entityId: created[0]?.id ?? null,
    metadata: { type: input.type, channels },
  });
  return created;
}

/**
 * Scan for alertable conditions: demurrage countdown ≤3 days, docs expiring
 * in ≤30 days, permits expiring. Called by dashboard load + cron (pg_cron in Supabase).
 */
export async function scanAlerts(tenantId: string): Promise<number> {
  const { db } = await import('@/lib/db');
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const in3 = new Date(now.getTime() + 3 * 86400000);
  let created = 0;

  const active = await db.shipment.findMany({
    where: { tenantId, status: { notIn: ['released'] } },
    select: { id: true, reference: true, eta: true, status: true, demurrageStartDate: true, demurrageFreeDays: true },
  });

  for (const s of active) {
    // Demurrage countdown: free days running out
    if (s.demurrageStartDate && s.status !== 'released') {
      const freeUntil = new Date(s.demurrageStartDate.getTime() + s.demurrageFreeDays * 86400000);
      const daysLeft = Math.ceil((freeUntil.getTime() - now.getTime()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 3) {
        const existing = await db.notification.findFirst({
          where: { tenantId, shipmentId: s.id, type: 'demurrage', createdAt: { gte: new Date(now.getTime() - 86400000) } },
        });
        if (!existing) {
          await notify({
            tenantId, type: 'demurrage', severity: daysLeft <= 1 ? 'critical' : 'warning',
            title: `Demurrage: free days end ${daysLeft === 0 ? 'TODAY' : `in ${daysLeft} day(s)`}`,
            body: `Shipment ${s.reference}: ${daysLeft} grace day(s) left. Penalty applies after.`,
            shipmentId: s.id,
          });
          created++;
        }
      }
    }
    // ETA reached but still in transit
    if (s.eta && s.eta < now) {
      const existing = await db.notification.findFirst({
        where: { tenantId, shipmentId: s.id, type: 'eta', createdAt: { gte: new Date(now.getTime() - 86400000) } },
      });
      if (!existing) {
        await notify({
          tenantId, type: 'eta', severity: 'info',
          title: `ETA passed on ${s.reference}`,
          body: 'The estimated arrival date has passed — update the shipment status.',
          shipmentId: s.id,
        });
        created++;
      }
    }
  }

  // Documents expiring in 30 days
  const docs = await db.document.findMany({
    where: { tenantId, isCurrent: true, expiryDate: { lte: in30, gte: now } },
    select: { id: true, title: true, expiryDate: true },
  });
  for (const d of docs) {
    const existing = await db.notification.findFirst({
      where: { tenantId, type: 'permit_expiry', title: { contains: d.title } },
    });
    if (!existing) {
      await notify({
        tenantId, type: 'permit_expiry', severity: 'warning',
        title: `Document expiring: ${d.title}`,
        body: `Expires on ${d.expiryDate?.toISOString().slice(0, 10) ?? '—'}. Renew to avoid penalties.`,
      });
      created++;
    }
  }
  return created;
}
