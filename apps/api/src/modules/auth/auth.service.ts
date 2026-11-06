import bcrypt from 'bcryptjs';
import { config } from '../../config.js';
import type { Person, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import { signToken } from '../../middleware/auth.js';
import { clearFailures, lockedFor, recordFailure } from './lockout.js';
import { mfaToken, personIdFrom, verifySignIn } from './mfa.service.js';

export const hashPassword = (password: string) => bcrypt.hash(password, 10);

// Compared against when there is no account (or no password), so every attempt costs one bcrypt
// check and an unknown email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('no-account-has-this-password', 10);

type AuthAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.locked'
  | 'auth.mfa_failed'
  | 'auth.mfa_enabled'
  | 'auth.mfa_disabled';

/** Attempts that didn't prove who was there have no actor. */
const UNPROVEN: AuthAction[] = ['auth.login_failed', 'auth.locked', 'auth.mfa_failed'];

/** Sign-in events in the audit log ("Audit-logged access" on the sign-in page). */
export function audit(action: AuthAction, personId: string | null, ip?: string, after?: object) {
  return prisma.auditLog.create({
    data: {
      actorId: UNPROVEN.includes(action) ? null : personId,
      action,
      entityType: 'Person',
      entityId: personId,
      ip,
      after: after as Prisma.InputJsonValue | undefined,
    },
  });
}

const lockedError = (retryAfterSeconds: number) =>
  new HttpError(
    423,
    'Too many failed sign-in attempts. Try again later or contact your administrator.',
    { code: 'ACCOUNT_LOCKED', retryAfterSeconds },
  );

/**
 * Email and password sign-in. An unknown email and a wrong password get the same 401. After
 * MAX_FAILURES failures the address is locked (423 with retryAfterSeconds). A disabled account
 * is only reported (403 ACCOUNT_DISABLED) once the password has been shown to be right.
 */
export async function login(email: string, password: string, ip?: string) {
  const key = email.toLowerCase();
  const wait = lockedFor(key);
  if (wait) throw lockedError(wait);

  const person = await prisma.person.findUnique({ where: { email: key } });
  const matches = await bcrypt.compare(password, person?.passwordHash ?? DUMMY_HASH);
  if (!person?.passwordHash || !matches) {
    const { locked, retryAfterSeconds } = recordFailure(key);
    await audit('auth.login_failed', person?.id ?? null, ip, { email: key });
    if (locked) {
      await audit('auth.locked', person?.id ?? null, ip, { email: key, retryAfterSeconds });
      throw lockedError(retryAfterSeconds);
    }
    throw new HttpError(401, 'Invalid credentials');
  }
  if (!person.active) {
    await audit('auth.login_failed', person.id, ip, { email: key, reason: 'disabled' });
    throw new HttpError(403, 'This account is disabled. Contact your administrator.', {
      code: 'ACCOUNT_DISABLED',
    });
  }

  clearFailures(key);
  // Two-step verification: the session starts once the authenticator code is checked.
  if (person.mfaEnabled) return { mfaRequired: true as const, mfaToken: mfaToken(person.id) };
  await audit('auth.login', person.id, ip);
  return session(person);
}

/** Second sign-in step: the code from the authenticator app. */
export async function verifyMfa(token: string, code: string, ip?: string) {
  try {
    const person = await verifySignIn(token, code);
    await audit('auth.login', person.id, ip, { mfa: true });
    return session(person);
  } catch (err) {
    const id = personIdFrom(token);
    if (id && err instanceof HttpError && (err.status === 401 || err.status === 423)) {
      await audit('auth.mfa_failed', id, ip);
    }
    throw err;
  }
}

/** Token and user details returned after sign-in or sign-up. */
function session(person: Person) {
  const user = { id: person.id, email: person.email, role: person.role };
  return {
    token: signToken(user),
    user: { ...user, name: person.name, mustChangePassword: person.mustChangePassword },
  };
}

/**
 * Self sign-up from the login page, for company email domains only (SIGNUP_DOMAINS). New people
 * are team members with no projects; an admin can change their role and staffing afterwards.
 */
export async function signup(input: { name: string; email: string; password: string }) {
  const domains = config.SIGNUP_DOMAINS;
  if (!domains.length) throw new HttpError(403, 'Sign-up is turned off. Ask an admin to add you.');

  const email = input.email.toLowerCase();
  if (!domains.includes(email.split('@').pop()!)) {
    throw new HttpError(
      400,
      `Use your company email address (${domains.map((d) => `@${d}`).join(', ')}).`,
    );
  }
  // Also covers people an admin added without a password: an admin sets theirs.
  if (await prisma.person.findUnique({ where: { email }, select: { id: true } })) {
    throw new HttpError(
      409,
      'An account with this email already exists. Sign in, or ask an admin to reset your password.',
    );
  }

  const person = await prisma.person.create({
    data: {
      name: input.name,
      email,
      role: 'MEMBER',
      passwordHash: await hashPassword(input.password),
    },
  });
  return session(person);
}

export async function me(id: string) {
  const person = await prisma.person.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
      mustChangePassword: true,
    },
  });
  if (!person) throw new HttpError(404, 'User not found');
  return person;
}

/** Change your own password (also clears a pending "must change" after an admin reset). */
export async function changePassword(id: string, currentPassword: string, newPassword: string) {
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person?.passwordHash) throw new HttpError(404, 'User not found');
  if (!(await bcrypt.compare(currentPassword, person.passwordHash))) {
    throw new HttpError(400, 'Your current password is not correct', {
      fieldErrors: { currentPassword: ['Not correct'] },
    });
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'Choose a password different from the current one', {
      fieldErrors: { newPassword: ['Same as the current password'] },
    });
  }
  await prisma.person.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });
}
