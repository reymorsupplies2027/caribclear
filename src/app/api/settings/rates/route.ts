import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireBrokerAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { checkRate, getIp } from '@/lib/rate-limit';
import { normalizeRateConfig, DEFAULT_RATE_CONFIG, type RateConfigSnapshot } from '@/lib/engine/landed-cost';

/**
 * Rate Configuration — the "when the law changes" mechanism.
 *
 * The landed-cost engine NEVER hardcodes legal figures: every rate, bracket,
 * fee and threshold lives in the versioned RateConfig table as the
 * `engine_snapshot` key. When a national instrument changes (budget, legal
 * notice, CET revision, new fee schedule), the broker admin records a NEW
 * VERSION here with an effectiveFrom date and a note citing the instrument.
 * No code change, no deploy. New calculations pick up the active version;
 * previously saved calculations keep their own snapshot (historical truth).
 */

interface VersionRow {
  id: string;
  version: number;
  effectiveFrom: Date;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
}

export async function GET(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const rows = await db.rateConfig.findMany({
      where: { key: 'engine_snapshot' },
      orderBy: [{ version: 'desc' }],
      take: 12,
    });
    const active = rows.find((r) => r.isActive) ?? rows[0] ?? null;
    const history: VersionRow[] = rows.map((r) => ({
      id: r.id, version: r.version, effectiveFrom: r.effectiveFrom,
      notes: r.notes, isActive: r.isActive, createdAt: r.createdAt,
    }));
    let config: RateConfigSnapshot = DEFAULT_RATE_CONFIG;
    let version = 0;
    if (active) {
      try { config = normalizeRateConfig(JSON.parse(active.value)); } catch { /* compiled default */ }
      version = active.version;
    }
    return ok({
      config, version,
      effectiveFrom: active?.effectiveFrom ?? null,
      notes: active?.notes ?? null,
      history,
    });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const rl = checkRate(`rates:${s.tenantId}:${getIp(req)}`, 10, 3_600_000);
    if (rl.limited) return fail(429, 'RATE_LIMITED', 'Too many rate changes — wait a few minutes.');

    const body = await readJson<{ config?: unknown; notes?: string; effectiveFrom?: string }>(req);
    if (!body.config || typeof body.config !== 'object') return fail(400, 'MISSING_CONFIG', 'config object is required.');

    // normalizeRateConfig coerces/validates every field against the engine's
    // expected shape — anything malformed falls back to the legal default,
    // so a typo can never poison the duty engine.
    const clean = normalizeRateConfig(body.config);
    const schemaKeys = Object.keys(DEFAULT_RATE_CONFIG) as Array<keyof RateConfigSnapshot>;
    const incoming = body.config as Record<string, unknown>;
    const missing = schemaKeys.filter((k) => !(k in incoming));
    if (missing.length) return fail(422, 'INCOMPLETE_CONFIG', `Missing fields (send the FULL snapshot): ${missing.join(', ')}`);

    const effFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();
    if (Number.isNaN(effFrom.getTime())) return fail(400, 'BAD_DATE', 'effectiveFrom must be a valid date (YYYY-MM-DD).');

    const notes = String(body.notes || '').slice(0, 500);
    if (!notes) return fail(422, 'NOTES_REQUIRED', 'Cite the legal instrument that justifies this change (e.g. "L.N. 613 of 2026, in force 4 Aug 2026"). Auditors will ask.');

    const last = await db.rateConfig.findFirst({ where: { key: 'engine_snapshot' }, orderBy: { version: 'desc' } });
    const nextVersion = (last?.version ?? 0) + 1;

    const created = await db.$transaction(async (tx) => {
      await tx.rateConfig.updateMany({
        where: { key: 'engine_snapshot', isActive: true },
        data: { isActive: false },
      });
      return tx.rateConfig.create({
        data: {
          key: 'engine_snapshot',
          version: nextVersion,
          value: JSON.stringify(clean),
          effectiveFrom: effFrom,
          isActive: true,
          notes,
        },
      });
    });

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId,
      action: 'rates.new_version',
      entityType: 'rate_config', entityId: created.id,
      metadata: { version: nextVersion, effectiveFrom: effFrom.toISOString(), notes },
    });

    return ok({ version: nextVersion, effectiveFrom: effFrom, config: clean });
  } catch (err) { return guardError(err); }
}
