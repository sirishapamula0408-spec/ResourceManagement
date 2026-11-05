import { prisma } from './prisma.js';
import type { AuthUser } from '../middleware/auth.js';

/**
 * What a team member may see: only their own projects, the tasks on those projects (their
 * board), and their own figures. Viewers (read-only observers) get the same scope. Every other
 * role sees everything. Each read endpoint applies these scopes on the server, so hiding
 * something in the UI is never the only protection.
 *
 * This is a read scope only: it grants nothing. Write rights are checked separately
 * (tasks.service.ts, permissions.ts), and viewers have none.
 */
export const isMember = (user: AuthUser | undefined) =>
  user?.role === 'MEMBER' || user?.role === 'VIEWER';

/** Ids of the projects a person owns or is staffed on. */
export async function projectIdsOf(personId: string): Promise<string[]> {
  const rows = await prisma.project.findMany({
    where: { OR: [{ ownerId: personId }, { members: { some: { personId } } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * For a team member or viewer, the project ids they may see; `null` means "no restriction"
 * (every other role).
 */
export async function visibleProjectIds(user: AuthUser): Promise<string[] | null> {
  return isMember(user) ? projectIdsOf(user.id) : null;
}
