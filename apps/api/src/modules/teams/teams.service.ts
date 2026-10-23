import { prisma } from '../../lib/prisma.js';

/** All teams, or only the teams `personId` belongs to (a team member's view). */
export function listTeams(personId?: string) {
  return prisma.team.findMany({
    where: personId ? { members: { some: { personId } } } : undefined,
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
