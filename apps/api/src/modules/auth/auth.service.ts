import bcrypt from 'bcryptjs';
import { config } from '../../config.js';
import type { Person } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import { signToken } from '../../middleware/auth.js';

export const hashPassword = (password: string) => bcrypt.hash(password, 10);

export async function login(email: string, password: string) {
  const person = await prisma.person.findUnique({ where: { email: email.toLowerCase() } });
  if (!person?.passwordHash || !person.active) throw new HttpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, person.passwordHash);
  if (!ok) throw new HttpError(401, 'Invalid credentials');
  return session(person);
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
