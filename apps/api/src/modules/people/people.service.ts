import { prisma } from '../../lib/prisma.js';
import type { Role } from '../../generated/prisma/enums.js';

export async function listPeople() {
  const people = await prisma.person.findMany({
    where: { active: true },
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
}

async function departmentId(name: string | null | undefined) {
  if (name === undefined) return undefined;
  if (!name) return null;
  const dept = await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  return dept.id;
}

export async function createPerson({ department, ...input }: PersonInput) {
  return prisma.person.create({
    data: { ...input, departmentId: await departmentId(department) },
  });
}

export async function updatePerson(id: string, { department, ...input }: Partial<PersonInput>) {
  return prisma.person.update({
    where: { id },
    data: { ...input, departmentId: await departmentId(department) },
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
