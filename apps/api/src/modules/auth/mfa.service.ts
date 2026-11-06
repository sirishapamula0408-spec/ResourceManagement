import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { config } from '../../config.js';
import { HttpError } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { open, seal } from '../../lib/secretBox.js';
import { matchStep, newSecret, otpauthUrl } from '../../lib/totp.js';
import { clearFailures, lockedFor, recordFailure } from './lockout.js';

/**
 * Two-step sign-in with an authenticator app (Microsoft Authenticator, or any TOTP app).
 * After the password, people with MFA on get a short-lived MFA token instead of a session and
 * finish at POST /auth/mfa/verify. Codes come from the app, so there is nothing to resend.
 */

const ISSUER = 'SedHub';
const MFA_TOKEN_TTL = '5m';
const MFA_AUDIENCE = 'mfa';

/** Proof the password step passed; only accepted by /auth/mfa/verify. */
export const mfaToken = (personId: string) =>
  jwt.sign({}, config.JWT_SECRET, {
    subject: personId,
    audience: MFA_AUDIENCE,
    expiresIn: MFA_TOKEN_TTL,
  });

const expired = () =>
  new HttpError(401, 'Your sign-in has expired. Sign in again.', { code: 'MFA_TOKEN_EXPIRED' });

/** The person an MFA token was issued to, or null if it is invalid or expired. */
export function personIdFrom(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      audience: MFA_AUDIENCE,
    }) as jwt.JwtPayload;
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

const lockedError = (retryAfterSeconds: number) =>
  new HttpError(423, 'Too many wrong codes. Try again later or contact your administrator.', {
    code: 'ACCOUNT_LOCKED',
    retryAfterSeconds,
  });

/**
 * Second step of sign-in. Wrong codes count towards a lockout of their own (5 in 15 minutes),
 * and each code works once. Returns the person, for the caller to start the session.
 */
export async function verifySignIn(token: string, code: string) {
  const id = personIdFrom(token);
  if (!id) throw expired();
  const key = `mfa:${id}`;
  const wait = lockedFor(key);
  if (wait) throw lockedError(wait);

  const person = await prisma.person.findUnique({ where: { id } });
  if (!person?.active || !person.mfaEnabled || !person.mfaSecret) throw expired();
  const step = matchStep(open(person.mfaSecret), code);
  if (step === null || step <= (person.mfaLastStep ?? -1)) {
    const { locked, retryAfterSeconds } = recordFailure(key);
    if (locked) throw lockedError(retryAfterSeconds);
    throw new HttpError(401, 'That code is incorrect or has expired.', {
      code: 'MFA_CODE_INVALID',
    });
  }
  clearFailures(key);
  await prisma.person.update({ where: { id }, data: { mfaLastStep: step } });
  return person;
}

export async function status(id: string) {
  const person = await prisma.person.findUniqueOrThrow({
    where: { id },
    select: { mfaEnabled: true },
  });
  return { enabled: person.mfaEnabled };
}

/**
 * Start setting up: a new secret, kept (encrypted) until the first code confirms it. Returns
 * what the app needs: a QR code, and the key for typing in by hand.
 */
export async function startSetup(id: string) {
  const person = await prisma.person.findUniqueOrThrow({ where: { id } });
  if (person.mfaEnabled) {
    throw new HttpError(
      409,
      'Two-step verification is already on. Turn it off first to move it to a new phone.',
    );
  }
  const secret = newSecret();
  await prisma.person.update({
    where: { id },
    data: { mfaSecret: seal(secret), mfaLastStep: null },
  });
  const url = otpauthUrl(secret, person.email, ISSUER);
  return {
    secret: secret.match(/.{1,4}/g)!.join(' '),
    account: person.email,
    issuer: ISSUER,
    otpauthUrl: url,
    qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
  };
}

/** Finish setting up with the first code from the app. */
export async function enable(id: string, code: string) {
  const person = await prisma.person.findUniqueOrThrow({ where: { id } });
  if (person.mfaEnabled) throw new HttpError(409, 'Two-step verification is already on.');
  if (!person.mfaSecret) throw new HttpError(400, 'Start the set-up first.');
  const step = matchStep(open(person.mfaSecret), code);
  if (step === null) {
    throw new HttpError(
      400,
      'That code doesn’t match. Check the app shows SedHub and enter its current code.',
    );
  }
  await prisma.person.update({ where: { id }, data: { mfaEnabled: true, mfaLastStep: step } });
}

/** Turn it off yourself, with your password. */
export async function disable(id: string, password: string) {
  const person = await prisma.person.findUniqueOrThrow({ where: { id } });
  if (!person.passwordHash || !(await bcrypt.compare(password, person.passwordHash))) {
    throw new HttpError(400, 'Your password is not correct');
  }
  await reset(id);
}

/** Clear it (also an admin's reset for someone who lost their phone). */
export async function reset(id: string) {
  await prisma.person.update({
    where: { id },
    data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: null },
  });
}
