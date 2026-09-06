import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireAuth } from '@/lib/session';
import { verifyTotp, decryptSecret } from '@/lib/totp';
import { appendAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const s = await requireAuth();
    const { code } = await readJson<{ code: string }>(req);
    const sec = await db.userSecurity.findUnique({ where: { userId: s.userId } });
    if (!sec?.totpEnabled || !sec.totpSecretEnc) return fail(400, 'NOT_ENABLED', '2FA is not enabled.');
    const result = verifyTotp(decryptSecret(sec.totpSecretEnc), code || '', sec.lastTotpCounter);
    if (!result.ok) return fail(401, 'INVALID_CODE', 'Wrong code.');
    await db.userSecurity.update({ where: { userId: s.userId }, data: { lastTotpCounter: result.counter } });
    return ok({ verified: true });
  } catch (err) { return guardError(err); }
}
