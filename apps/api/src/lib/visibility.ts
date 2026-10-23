import { prisma } from './prisma.js';
import type { AuthUser } from '../middleware/auth.js';

/**
 * What a team member may see: only their own projects, the tasks on those projects (their
 * board), and their own figures. Every other role sees everything. Each read endpoint applies
 * these scopes on the server, so hiding something in the UI is never the only protection.
 */
export const isMember = (user: AuthUser | undefined) => user?.role === 'MEMBER';

/** Ids of the projects a person owns or is staffed on. */
export async function projectIdsOf(personId: string): Promise<string[]> {
  const rows = await prisma.project.findMany({
    where: { OR: [{ ownerId: personId }, { members: { some: { personId } } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * For a team member, the project ids they may see; `null` means "no restriction"
 * (every other role).
 */
export async function visibleProjectIds(user: AuthUser): Promise<string[] | null> {
  return isMember(user) ? projectIdsOf(user.id) : null;
}
