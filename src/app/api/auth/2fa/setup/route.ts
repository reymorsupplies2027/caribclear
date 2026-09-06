import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, guardError } from '@/lib/api';
import { requireAuth } from '@/lib/session';
import { generateTotpSecret, encryptSecret, otpauthUri } from '@/lib/totp';

export async function POST(_req: NextRequest) {
  try {
    const s = await requireAuth();
    const secret = generateTotpSecret();
    await db.userSecurity.upsert({
      where: { userId: s.userId },
      create: { userId: s.userId, pendingSecretEnc: encryptSecret(secret) },
      update: { pendingSecretEnc: encryptSecret(secret), pendingCreatedAt: new Date() },
    });
    return ok({ secret, otpauthUri: otpauthUri(secret, s.email) });
  } catch (err) { return guardError(err); }
}
