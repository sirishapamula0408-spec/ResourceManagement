import { prisma } from '../../lib/prisma.js';

export function listPeople() {
  return prisma.person.findMany({
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
    },
  });
}

export function listDepartments() {
  return prisma.department.findMany({ orderBy: { name: 'asc' } });
}
