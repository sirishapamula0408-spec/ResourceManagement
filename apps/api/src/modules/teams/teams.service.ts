import { prisma } from '../../lib/prisma.js';

export function listTeams() {
  return prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: {
      members: {
        include: { person: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });
}
