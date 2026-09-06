import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireAuth } from '@/lib/session';
import { appendAuditLog } from '@/lib/audit';

/**
 * POST /api/push/subscribe — store a Web Push subscription for the signed-in user.
 * Graceful: returns 501 with a clear message when VAPID keys are not configured.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return fail(501, 'PUSH_NOT_CONFIGURED', 'Push is not configured on the server yet (missing VAPID keys).');
    }
    const body = await readJson<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(req);
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return fail(400, 'INVALID_SUBSCRIPTION', 'endpoint and keys (p256dh, auth) are required.');
    }
    await db.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { p256dh: body.keys.p256dh, auth: body.keys.auth, userId: session.userId },
      create: {
        userId: session.userId, endpoint: body.endpoint,
        p256dh: body.keys.p256dh, auth: body.keys.auth,
        userAgent: req.headers.get('user-agent') ?? null,
      },
    });
    await appendAuditLog({
      tenantId: session.tenantId, userId: session.userId, action: 'push.subscribed',
      entityType: 'push_subscription', entityId: body.endpoint.slice(0, 80),
      metadata: { userAgent: req.headers.get('user-agent') ?? null },
    });
    return ok({ subscribed: true });
  } catch (err) { return guardError(err); }
}

/** DELETE — unsubscribe (endpoint removed or user logs out of push). */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const body = await readJson<{ endpoint?: string }>(req);
    if (!body.endpoint) return fail(400, 'MISSING_FIELDS', 'endpoint required.');
    await db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: session.userId } });
    return ok({ subscribed: false });
  } catch (err) { return guardError(err); }
}
