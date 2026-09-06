import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireAuth } from '@/lib/session';
import { decryptSecret, verifyTotp, generateBackupCodes } from '@/lib/totp';
import { appendAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const s = await requireAuth();
    const { code } = await readJson<{ code: string }>(req);
    const sec = await db.userSecurity.findUnique({ where: { userId: s.userId } });
    if (!sec?.pendingSecretEnc) return fail(400, 'NO_PENDING', 'Run setup first.');
    const result = verifyTotp(decryptSecret(sec.pendingSecretEnc), code || '');
    if (!result.ok) return fail(401, 'INVALID_CODE', 'Wrong code — check your authenticator clock.');

    const { codes, hashes } = generateBackupCodes();
    await db.userSecurity.update({
      where: { userId: s.userId },
      data: {
        totpSecretEnc: sec.pendingSecretEnc, totpEnabled: true,
        pendingSecretEnc: null, pendingCreatedAt: null,
        lastTotpCounter: result.counter, backupCodesHash: JSON.stringify(hashes),
      },
    });
    await appendAuditLog({ tenantId: s.tenantId, userId: s.userId, action: 'security.2fa_enabled', entityType: 'user', entityId: s.userId });
    return ok({ backupCodes: codes });
  } catch (err) { return guardError(err); }
}
