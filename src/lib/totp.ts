/**
 * CaribClear — TOTP 2FA (RFC 6238) + backup codes + secret encryption.
 * Standalone UserSecurity table keeps login bulletproof even if this
 * feature table is missing (same production-safety pattern as tt-wb).
 */
import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += BASE32_ALPHABET[bytes[i] % 32];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, timeStep: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(timeStep / 1000000000), 0);
  buf.writeUInt32BE(Math.floor(timeStep % 1000000000), 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1000000).padStart(6, '0');
}

/** Verify with ±1 step tolerance; enforces counter monotonicity (replay protection). */
export function verifyTotp(secret: string, code: string, lastCounter?: number | null): { ok: boolean; counter: number } {
  const now = Math.floor(Date.now() / 30000);
  const target = code.replace(/\s/g, '');
  for (const step of [now, now - 1, now + 1]) {
    if (lastCounter && step <= lastCounter) continue;
    if (totpCode(secret, step * 30) === target) return { ok: true, counter: step };
  }
  return { ok: false, counter: 0 };
}

export function otpauthUri(secret: string, email: string, issuer = 'CaribClear'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function encryptSecret(plain: string): string {
  const key = process.env.JWT_SECRET || process.env.WHISTLE_ENCRYPTION_KEY || 'caribclear-dev-secret-change-in-production';
  const k = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, enc, c.getAuthTag()]).toString('base64');
}

export function decryptSecret(packed: string): string {
  const key = process.env.JWT_SECRET || process.env.WHISTLE_ENCRYPTION_KEY || 'caribclear-dev-secret-change-in-production';
  const k = crypto.createHash('sha256').update(key).digest();
  const buf = Buffer.from(packed, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(12, buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

export function generateBackupCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    codes.push(code);
    hashes.push(crypto.createHash('sha256').update(code).digest('hex'));
  }
  return { codes, hashes };
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
