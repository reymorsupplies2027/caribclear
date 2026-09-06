import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import {
  createSessionToken, setSessionCookie, createTwoFactorChallengeToken,
} from '@/lib/session';
import { verifyTotp, hashCode } from '@/lib/totp';
import { checkRate, getIp } from '@/lib/rate-limit';
import { appendAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    const body = await readJson<{ email: string; password: string; totp?: string }>(req);
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !body.password) return fail(400, 'MISSING_FIELDS', 'Email and password are required.');

    const rl = checkRate(`login:${ip}`, 10, 300_000);
    if (rl.limited) return fail(429, 'AUTH_RATE_LIMITED', 'Too many attempts. Wait 5 minutes.');

    const user = await db.user.findUnique({
      where: { email },
      include: { security: true, tenant: { select: { id: true, name: true, isActive: true } } },
    });
    if (!user || !user.passwordHash) {
      await appendAuditLog({ tenantId: null, action: 'auth.login_failed', entityType: 'user', metadata: { email, reason: 'not_found' } });
      return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    // Progressive lockout (15 min → 24h) at account level
    const sec = user.security;
    if (sec?.lockedUntil && sec.lockedUntil > new Date()) {
      const mins = Math.ceil((sec.lockedUntil.getTime() - Date.now()) / 60000);
      return fail(423, 'ACCOUNT_LOCKED', `Account locked after failed attempts. Try again in ${mins} min.`);
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      const attempts = (sec?.failedLoginAttempts ?? 0) + 1;
      const lockMins = attempts >= 10 ? 24 * 60 : attempts >= 5 ? 15 : 0;
      await db.userSecurity.upsert({
        where: { userId: user.id },
        create: { userId: user.id, failedLoginAttempts: attempts, lockedUntil: lockMins ? new Date(Date.now() + lockMins * 60000) : null },
        update: { failedLoginAttempts: attempts, lockedUntil: lockMins ? new Date(Date.now() + lockMins * 60000) : undefined },
      });
      await appendAuditLog({ tenantId: user.tenantId, action: 'auth.login_failed', entityType: 'user', entityId: user.id, metadata: { attempts } });
      return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    if (!user.isActive) return fail(403, 'ACCOUNT_INACTIVE', 'This account is deactivated. Contact your administrator.');
    if (user.tenantId && user.tenant && !user.tenant.isActive) {
      return fail(403, 'TENANT_INACTIVE', 'Your organization is suspended. Contact CaribClear support.');
    }

    // 2FA challenge when enabled
    if (sec?.totpEnabled && sec.totpSecretEnc) {
      if (!body.totp) {
        return ok({ twoFactorRequired: true, challenge: createTwoFactorChallengeToken(user.id) });
      }
      const { decryptSecret } = await import('@/lib/totp');
      const result = verifyTotp(decryptSecret(sec.totpSecretEnc), body.totp, sec.lastTotpCounter);
      if (!result.ok) {
        // try backup code
        const hashes: string[] = sec.backupCodesHash ? JSON.parse(sec.backupCodesHash) : [];
        const idx = hashes.indexOf(hashCode(body.totp));
        if (idx === -1) {
          await appendAuditLog({ tenantId: user.tenantId, action: 'auth.2fa_failed', entityType: 'user', entityId: user.id });
          return fail(401, 'INVALID_2FA', 'Invalid authentication code.');
        }
        hashes.splice(idx, 1);
        await db.userSecurity.update({ where: { userId: user.id }, data: { backupCodesHash: JSON.stringify(hashes) } });
      } else {
        await db.userSecurity.update({ where: { userId: user.id }, data: { lastTotpCounter: result.counter } });
      }
    }

    // Success — reset lockout, stamp lastLogin
    await db.userSecurity.updateMany({ where: { userId: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await appendAuditLog({
      tenantId: user.tenantId, userId: user.id, action: 'auth.login',
      entityType: 'user', entityId: user.id, metadata: { role: user.role },
    });

    const res = ok({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
    });
    setSessionCookie(res, createSessionToken(user.id, user.tenantId));
    return res;
  } catch (err) { return guardError(err); }
}
