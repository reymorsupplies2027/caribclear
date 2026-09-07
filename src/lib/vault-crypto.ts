/**
 * CaribClear — Document Vault encryption at rest.
 * AES-256-GCM envelope: file bytes are stored as `CCV1:<iv>:<tag>:<ciphertext>` (base64).
 * Key: VAULT_ENCRYPTION_KEY env (32-byte via SHA-256). In production this MUST be
 * provided by the secret manager; the dev fallback keeps local/CI runs working.
 *
 * This is the REAL code path used by /api/documents (write) and /api/documents/[id]
 * (read-back) — the tower health probe round-trips through these exact functions.
 */
import crypto from 'node:crypto';

const MAGIC = 'CCV1:';

function vaultKey(): Buffer {
  const secret = process.env.VAULT_ENCRYPTION_KEY || 'caribclear-dev-vault-key';
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes = AES-256
}

/** Encrypt plaintext bytes → vault envelope string (single write unit). */
export function vaultEncrypt(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(MAGIC + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':'), 'utf8');
}

/** Decrypt a vault envelope → original bytes. Passes legacy (non-envelope) files through. */
export function vaultDecrypt(stored: Buffer): Buffer {
  const head = stored.subarray(0, MAGIC.length).toString('utf8');
  if (head !== MAGIC) return stored; // legacy plaintext file — passthrough, not an error
  const [ivB64, tagB64, ctB64] = stored.subarray(MAGIC.length).toString('utf8').split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('VAULT_CORRUPT');
  const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
}

/** True when the buffer is a vault envelope (CCV1 magic). */
export function isVaultEnvelope(stored: Buffer): boolean {
  return stored.subarray(0, MAGIC.length).toString('utf8') === MAGIC;
}
