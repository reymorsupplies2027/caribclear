/**
 * CaribClear — Tenant & Role Guards (app-layer isolation)
 * Defense in depth: RLS guards the DB in Supabase (see supabase/),
 * these guards protect every route handler at the application layer.
 */
import { NextRequest } from 'next/server';
import { AuthSession, ForbiddenError, UnauthorizedError, requireAuth } from '@/lib/session';

export { ForbiddenError, UnauthorizedError };

const STAFF_ROLES = ['broker_admin', 'operator'] as const;
const ALL_TENANT_ROLES = ['broker_admin', 'operator', 'importer'] as const;

export interface TenantSession extends AuthSession {
  tenantId: string;
}

export async function requireTenant(req?: NextRequest): Promise<TenantSession & { user: AuthSession }> {
  const s = await requireAuth(req);
  if (!s.tenantId || !ALL_TENANT_ROLES.includes(s.role as (typeof ALL_TENANT_ROLES)[number])) {
    throw new ForbiddenError('No tenant context');
  }
  return s as TenantSession & { user: AuthSession };
}

export async function requireStaff(req?: NextRequest): Promise<TenantSession & { user: AuthSession }> {
  const s = await requireTenant(req);
  if (!STAFF_ROLES.includes(s.role as (typeof STAFF_ROLES)[number])) {
    throw new ForbiddenError('Staff access required');
  }
  return s;
}

export async function requireBrokerAdmin(req?: NextRequest): Promise<TenantSession & { user: AuthSession }> {
  const s = await requireTenant(req);
  if (s.role !== 'broker_admin') throw new ForbiddenError('Broker admin access required');
  return s;
}

export async function requireSuperAdmin(req?: NextRequest): Promise<AuthSession> {
  const s = await requireAuth(req);
  if (s.role !== 'super_admin') throw new ForbiddenError('Platform admin access required');
  return s;
}

/** Verify a resource belongs to the caller's tenant (defense in depth). */
export function assertTenantOwns(tenantId: string, resourceTenantId: string | null | undefined) {
  if (resourceTenantId !== tenantId) throw new ForbiddenError('Cross-tenant access denied');
}
