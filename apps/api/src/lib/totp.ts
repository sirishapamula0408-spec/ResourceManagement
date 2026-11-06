import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30-second steps), the codes
 * Microsoft Authenticator and other authenticator apps show.
 */

export const DIGITS = 6;
export const PERIOD_SECONDS = 30;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Not a base32 secret');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32-encoded (what the app stores). */
export const newSecret = () => base32Encode(randomBytes(20));

export const stepAt = (time = Date.now()) => Math.floor(time / 1000 / PERIOD_SECONDS);

/** The code for one time step. */
export function codeFor(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const n = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(n).padStart(digits, '0');
}

/**
 * The time step a code belongs to, allowing one step either side for clock drift; null if it
 * matches none. Callers reject steps at or before the last one accepted, so a code works once.
 */
export function matchStep(secret: string, code: string, time = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(time);
  for (const step of [now, now - 1, now + 1]) {
    const expected = Buffer.from(codeFor(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/** The link an authenticator app reads from the QR code. */
export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}
