import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError } from '@/lib/api';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return fail(401, 'UNAUTHORIZED', 'Not signed in.');
    const tenant = session.tenantId
      ? await db.tenant.findUnique({ where: { id: session.tenantId }, select: { plan: true, name: true, slug: true, defaultExchangeRate: true, onboarding: true, onboardingStep: true } })
      : null;
    return ok({ user: session, tenant });
  } catch (err) { return guardError(err); }
}
