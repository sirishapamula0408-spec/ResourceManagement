import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * AES-256-GCM for small secrets stored in the database (authenticator secrets), so a copy of
 * the database alone can't produce sign-in codes. The key comes from MFA_ENCRYPTION_KEY, or is
 * derived from JWT_SECRET when that isn't set; changing it means people set up MFA again.
 */
const key = createHash('sha256')
  .update(config.MFA_ENCRYPTION_KEY ?? `${config.JWT_SECRET}:mfa`)
  .digest();

/** "iv.tag.ciphertext", each base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function open(sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
