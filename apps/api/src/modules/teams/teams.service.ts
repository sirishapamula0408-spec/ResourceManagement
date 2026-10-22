import { prisma } from '../../lib/prisma.js';

export function listTeams() {
  return prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: {
      members: {
        // Removed (deactivated) people no longer appear in team groups.
        where: { person: { active: true } },
        include: { person: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });
}
