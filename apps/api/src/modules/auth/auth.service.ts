import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import { signToken } from '../../middleware/auth.js';

export async function login(email: string, password: string) {
  const person = await prisma.person.findUnique({ where: { email: email.toLowerCase() } });
  if (!person?.passwordHash || !person.active) throw new HttpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, person.passwordHash);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  const user = { id: person.id, email: person.email, role: person.role };
  return { token: signToken(user), user: { ...user, name: person.name } };
}

export async function me(id: string) {
  const person = await prisma.person.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, departmentId: true },
  });
  if (!person) throw new HttpError(404, 'User not found');
  return person;
}
