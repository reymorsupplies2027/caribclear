/**
 * CaribClear — Immutable hash-chained Audit Log (court-grade, jsonb-safe)
 * Canonical (key-sorted) serialization so re-verification is deterministic.
 * Every state-changing action in the system MUST append here.
 */
import crypto from 'crypto';

export interface AuditInput {
  tenantId: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = canonicalize((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

export function canonicalStringify(v: unknown): string {
  return JSON.stringify(canonicalize(v));
}

export function computeEntryHash(input: {
  tenantId: string | null; action: string; entityType: string;
  entityId: string | null; userId: string | null; metadata: unknown;
  prevHash: string | null; timestamp: string;
}): string {
  const payload = JSON.stringify({
    v: 2, tenantId: input.tenantId || '', action: input.action,
    entityType: input.entityType, entityId: input.entityId || '',
    userId: input.userId || '', metadata: canonicalize(input.metadata ?? {}),
    prevHash: input.prevHash || 'GENESIS', timestamp: input.timestamp,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Append an audit entry chained to the tenant's previous entry.
 * Never throws into the caller's transaction path on read issues —
 * audit failure is logged loudly but does not block business ops
 * EXCEPT when explicitly awaited by compliance-critical flows.
 */
export async function appendAuditLog(input: AuditInput): Promise<{ entryHash: string } | null> {
  try {
    const { db } = await import('@/lib/db');
    const prev = await db.auditLog.findFirst({
      where: { tenantId: input.tenantId },
      orderBy: { createdAt: 'desc' },
      select: { entryHash: true },
    });
    const prevHash = prev?.entryHash ?? null;
    const timestamp = new Date().toISOString();
    const entryHash = computeEntryHash({
      tenantId: input.tenantId, action: input.action, entityType: input.entityType,
      entityId: input.entityId ?? null, userId: input.userId ?? null,
      metadata: input.metadata ?? {}, prevHash, timestamp,
    });
    await db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: canonicalStringify(input.metadata ?? {}),
        prevHash, entryHash,
        createdAt: new Date(timestamp),
      },
    });
    return { entryHash };
  } catch (err) {
    console.error('[audit] append failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Verify the whole chain for a tenant (or the platform scope with null) — returns broken entry id or null. */
export async function verifyChain(tenantId: string | null): Promise<{ ok: boolean; brokenId?: string; checked: number }> {
  const { db } = await import('@/lib/db');
  const entries = await db.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });
  let prevHash: string | null = null;
  for (const e of entries) {
    const hash = computeEntryHash({
      tenantId: e.tenantId, action: e.action, entityType: e.entityType,
      entityId: e.entityId, userId: e.userId,
      metadata: e.metadata ? JSON.parse(e.metadata) : {},
      prevHash, timestamp: e.createdAt.toISOString(),
    });
    if (hash !== e.entryHash || (e.prevHash || null) !== prevHash) {
      return { ok: false, brokenId: e.id, checked: entries.length };
    }
    prevHash = e.entryHash;
  }
  return { ok: true, checked: entries.length };
}
