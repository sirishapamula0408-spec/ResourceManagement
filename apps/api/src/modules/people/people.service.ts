import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../auth/auth.service.js';
import type { Role } from '../../generated/prisma/enums.js';

/**
 * Everyone, or for a team member only themselves and the teammates on their projects
 * (names for the board), with project badges limited to those projects.
 */
export async function listPeople(scope: { personId: string; projectIds: string[] } | null = null) {
  const people = await prisma.person.findMany({
    where: scope
      ? {
          active: true,
          OR: [
            { id: scope.personId },
            { projectMemberships: { some: { projectId: { in: scope.projectIds } } } },
          ],
        }
      : { active: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      weeklyCapacityHours: true,
      department: { select: { id: true, name: true } },
      projectMemberships: {
        where: scope ? { projectId: { in: scope.projectIds } } : undefined,
        orderBy: { project: { code: 'asc' } },
        select: { project: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  return people.map(({ projectMemberships, ...p }) => ({
    ...p,
    projects: projectMemberships.map((m) => m.project),
  }));
}

export async function isAdmin(id: string) {
  const person = await prisma.person.findUnique({ where: { id }, select: { role: true } });
  return person?.role === 'ADMIN';
}

export function listDepartments() {
  return prisma.department.findMany({ orderBy: { name: 'asc' } });
}

export interface PersonInput {
  name: string;
  email: string;
  title?: string | null;
  role?: Role;
  /** Department by name; created if new (like the prototype's free-text department). */
  department?: string | null;
  weeklyCapacityHours?: number;
  /** Temporary password chosen by whoever adds or resets the person. */
  password?: string;
}

async function departmentId(name: string | null | undefined) {
  if (name === undefined) return undefined;
  if (!name) return null;
  const dept = await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  return dept.id;
}

/** A password set by someone else must be changed at the person's next sign-in. */
async function passwordFields(password: string | undefined) {
  return password === undefined
    ? {}
    : { passwordHash: await hashPassword(password), mustChangePassword: true };
}

// Never send password hashes back to the client.
const omitSecrets = { passwordHash: true } as const;

export async function createPerson({ department, password, ...input }: PersonInput) {
  return prisma.person.create({
    data: {
      ...input,
      ...(await passwordFields(password)),
      departmentId: await departmentId(department),
    },
    omit: omitSecrets,
  });
}

export async function updatePerson(
  id: string,
  { department, password, ...input }: Partial<PersonInput>,
) {
  return prisma.person.update({
    where: { id },
    data: {
      ...input,
      ...(await passwordFields(password)),
      departmentId: await departmentId(department),
    },
    omit: omitSecrets,
  });
}

/**
 * Remove a person from the team: deactivate (history such as worklogs stays) and unassign
 * their open tasks rather than deleting them, per the scope plan.
 */
export async function removePerson(id: string) {
  await prisma.$transaction([
    prisma.task.updateMany({
      where: { assigneeId: id, status: { not: 'DONE' } },
      data: { assigneeId: null },
    }),
    prisma.projectMember.deleteMany({ where: { personId: id } }),
    prisma.person.update({ where: { id }, data: { active: false } }),
  ]);
}

/** Replace the set of projects a person is staffed on. */
export async function setPersonProjects(personId: string, projectIds: string[]) {
  await prisma.$transaction([
    prisma.projectMember.deleteMany({ where: { personId, projectId: { notIn: projectIds } } }),
    prisma.projectMember.createMany({
      data: projectIds.map((projectId) => ({ projectId, personId })),
      skipDuplicates: true,
    }),
  ]);
}
