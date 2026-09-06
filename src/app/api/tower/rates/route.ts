import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Deep JSON diff — returns changed paths with old/new values. */
export function jsonDiff(a: unknown, b: unknown, path = ''): { path: string; old: unknown; new: unknown }[] {
  const out: { path: string; old: unknown; new: unknown }[] = [];
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (
    a !== null && b !== null && typeof a === 'object' && typeof b === 'object' &&
    !Array.isArray(a) && !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      out.push(...jsonDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
    }
  } else {
    out.push({ path: path || 'value', old: a, new: b });
  }
  return out;
}

/** GET /api/tower/rates — all rate config keys: active version + version history. */
export async function GET() {
  try {
    await requireSuperAdmin();
    const configs = await db.rateConfig.findMany({ orderBy: [{ key: 'asc' }, { version: 'desc' }] });
    const byKey: Record<string, { key: string; active: typeof configs[number] | null; history: typeof configs[number][] }> = {};
    for (const c of configs) {
      byKey[c.key] ??= { key: c.key, active: null, history: [] };
      if (c.isActive && !byKey[c.key].active) byKey[c.key].active = c;
      byKey[c.key].history.push(c);
    }
    // Order: engine_snapshot first (the core), then rest alphabetically
    const keys = Object.keys(byKey).sort((a, b) => (a === 'engine_snapshot' ? -1 : b === 'engine_snapshot' ? 1 : a.localeCompare(b)));
    return ok({ keys: keys.map(k => ({
      ...byKey[k],
      history: byKey[k].history.slice(0, 5),
    })) });
  } catch (err) { return guardError(err); }
}

/** POST /api/tower/rates — publish a new version of a rate table (Mando de Tasas). */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin(req);
    const body = await readJson<{ key?: string; value?: string; effectiveFrom?: string; notes?: string }>(req);
    if (!body.key || !body.value) return fail(400, 'MISSING_FIELDS', 'key and value are required.');
    let parsed: unknown;
    try { parsed = JSON.parse(body.value); } catch { return fail(400, 'INVALID_JSON', 'value must be valid JSON.'); }
    const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();
    if (isNaN(effectiveFrom.getTime())) return fail(400, 'INVALID_DATE', 'effectiveFrom is not a valid date.');

    const current = await db.rateConfig.findFirst({ where: { key: body.key, isActive: true }, orderBy: { version: 'desc' } });
    const diff = current ? jsonDiff(JSON.parse(current.value ?? '{}'), parsed) : [];
    const nextVersion = current ? current.version + 1 : 1;

    if (current) await db.rateConfig.update({ where: { id: current.id }, data: { isActive: false } });
    const created = await db.rateConfig.create({
      data: {
        key: body.key, value: body.value, version: nextVersion,
        effectiveFrom, isActive: true, notes: body.notes || null,
      },
    });

    // Broadcast to every tenant alert center — nobody finds out by WhatsApp rumor
    const tenants = await db.tenant.findMany({ select: { id: true } });
    if (tenants.length) {
      await db.notification.createMany({
        data: tenants.map(t => ({
          tenantId: t.id, type: 'rate_update', severity: 'warning',
          title: `Rate table updated — v${nextVersion} effective ${effectiveFrom.toISOString().slice(0, 10)}`,
          body: diff.length
            ? `${diff.length} rate line(s) changed: ${diff.slice(0, 3).map(d => d.path).join(', ')}${diff.length > 3 ? '…' : ''}. Review your saved products.`
            : 'New rate version published. Review the table.',
        })),
      });
    }

    await appendAuditLog({
      tenantId: null, userId: admin.userId, action: 'tower.rate_published',
      entityType: 'rate_config', entityId: created.id,
      metadata: { key: body.key, version: nextVersion, effectiveFrom, diff, notes: body.notes ?? null },
    });
    return ok({ key: body.key, version: nextVersion, effectiveFrom, diff, notifiedTenants: tenants.length });
  } catch (err) { return guardError(err); }
}
