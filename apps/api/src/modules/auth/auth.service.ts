import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import { signToken } from '../../middleware/auth.js';

export const hashPassword = (password: string) => bcrypt.hash(password, 10);

export async function login(email: string, password: string) {
  const person = await prisma.person.findUnique({ where: { email: email.toLowerCase() } });
  if (!person?.passwordHash || !person.active) throw new HttpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, person.passwordHash);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  const user = { id: person.id, email: person.email, role: person.role };
  return {
    token: signToken(user),
    user: { ...user, name: person.name, mustChangePassword: person.mustChangePassword },
  };
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
