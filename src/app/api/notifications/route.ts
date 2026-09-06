import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { scanAlerts } from '@/lib/notify';

export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    // Opportunistic alert scan (idempotent within 24h window per key)
    await scanAlerts(s.tenantId);
    const notifications = await db.notification.findMany({
      where: { tenantId: s.tenantId, channel: 'in_app' },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const unread = notifications.filter(n => !n.readAt).length;
    return ok({ notifications, unread });
  } catch (err) { return guardError(err); }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const body = await readJson<{ id?: string; all?: boolean }>(req);
    if (body.all) {
      await db.notification.updateMany({ where: { tenantId: s.tenantId, channel: 'in_app', readAt: null }, data: { readAt: new Date() } });
      return ok({ allRead: true });
    }
    if (!body.id) return fail(400, 'MISSING_ID', 'id or all=true required.');
    await db.notification.updateMany({ where: { id: body.id, tenantId: s.tenantId }, data: { readAt: new Date() } });
    return ok({ read: true });
  } catch (err) { return guardError(err); }
}
