/**
 * CaribClear — Stateless JWT Session (Vercel serverless safe)
 * Adapted from the tt-whistleblower battle-tested pattern.
 */
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export type Role = 'super_admin' | 'broker_admin' | 'operator' | 'importer';

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  tenantName: string | null;
  clientId: string | null;
}

function getSigningSecret(): Buffer {
  const secret = process.env.JWT_SECRET || process.env.WHISTLE_ENCRYPTION_KEY || 'caribclear-dev-secret-change-in-production';
  return crypto.createHash('sha256').update(secret).digest();
}

function b64u(data: Uint8Array | string): string {
  return Buffer.from(data).toString('base64url').replace(/=+$/, '');
}
function b64uDec(str: string): Buffer {
  return Buffer.from(str + '='.repeat((4 - (str.length % 4)) % 4), 'base64');
}

interface JwtPayload { userId: string; tenantId: string | null; exp: number; iat: number; purpose?: string }

function signJwt(payload: JwtPayload): string {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64u(sig)}`;
}

function verifyJwt(token: string): JwtPayload | null {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const expected = crypto.createHmac('sha256', getSigningSecret()).update(`${h}.${p}`).digest();
    const actual = b64uDec(s);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(b64uDec(p).toString('utf8')) as JwtPayload;
    if (Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

export function createSessionToken(userId: string, tenantId: string | null): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ userId, tenantId, iat: now, exp: now + 7 * 24 * 60 * 60, purpose: 'session' });
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set('cc-session', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/',
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set('cc-session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' });
}

// ── 2FA challenge tokens (5 min, purpose-bound) ──
export function createTwoFactorChallengeToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ userId, tenantId: null, iat: now, exp: now + 300, purpose: '2fa' });
}
export function verifyTwoFactorChallengeToken(token: string): { userId: string } | null {
  const p = verifyJwt(token);
  if (!p || p.purpose !== '2fa') return null;
  return { userId: p.userId };
}

export async function getSession(req?: NextRequest): Promise<AuthSession | null> {
  try {
    const store = req ? req.cookies : await cookies();
    const token = store.get('cc-session')?.value;
    if (!token) return null;
    const payload = verifyJwt(token);
    if (!payload || (payload.purpose && payload.purpose !== 'session')) return null;

    const { db } = await import('@/lib/db');
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: { select: { id: true, name: true, isActive: true } } },
    });
    if (!user || !user.isActive) return null;
    if (user.tenantId && user.tenant && !user.tenant.isActive) return null;
    return {
      userId: user.id, email: user.email, name: user.name,
      role: user.role as Role, tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null, clientId: user.clientId,
    };
  } catch { return null; }
}

export async function requireAuth(req?: NextRequest): Promise<AuthSession> {
  const s = await getSession(req);
  if (!s) throw new UnauthorizedError();
  return s;
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
