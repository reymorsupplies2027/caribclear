import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

/** PATCH /api/onboarding — tick checklist items */
export async function PATCH(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const body = await readJson<{ stepId: string; done?: boolean; advance?: boolean }>(req);
    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
    if (!tenant) return fail(404, 'NOT_FOUND', 'Tenant not found.');

    let steps: Array<{ id: string; label: string; done: boolean }> = [];
    try { steps = JSON.parse(tenant.onboarding); } catch { /* keep [] */ }
    if (body.stepId) {
      const idx = steps.findIndex(x => x.id === body.stepId);
      if (idx >= 0) steps[idx].done = body.done ?? true;
    }
    const advance = body.advance ? Math.min(tenant.onboardingStep + 1, 3) : tenant.onboardingStep;

    const updated = await db.tenant.update({
      where: { id: s.tenantId },
      data: { onboarding: JSON.stringify(steps), onboardingStep: advance },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'onboarding.progressed',
      entityType: 'tenant', entityId: s.tenantId, metadata: { stepId: body.stepId, step: advance },
    });
    return ok({ onboarding: JSON.parse(updated.onboarding), onboardingStep: updated.onboardingStep });
  } catch (err) { return guardError(err); }
}
