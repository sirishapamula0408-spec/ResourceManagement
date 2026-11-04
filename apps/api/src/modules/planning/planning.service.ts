import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { SprintStatus } from '../../generated/prisma/enums.js';
import { canManageProject } from '../tasks/tasks.service.js';

/** Sprints and epics belong to one project; an admin or a PM on it manages them. */
async function requireManage(user: AuthUser, projectId: string) {
  if (!(await canManageProject(user, projectId))) {
    throw new HttpError(403, 'Only an admin or a PM on this project can do that');
  }
}

/** Limit a list to some projects (a team member's), or none (`null` = every project). */
const inProjects = (projectId: string | undefined, projectIds: string[] | null) => ({
  ...(projectId ? { projectId } : {}),
  ...(projectIds
    ? { projectId: { in: projectId ? projectIds.filter((id) => id === projectId) : projectIds } }
    : {}),
});

/** Task counts for a sprint or epic: all of them and those done. */
async function taskCounts(field: 'sprintId' | 'epicId', ids: string[]) {
  const rows = await prisma.task.groupBy({
    by: [field, 'status'],
    where: { [field]: { in: ids } },
    _count: { _all: true },
  });
  const counts = new Map<string, { tasks: number; done: number }>();
  for (const r of rows) {
    const id = r[field] as string;
    const c = counts.get(id) ?? { tasks: 0, done: 0 };
    c.tasks += r._count._all;
    if (r.status === 'DONE') c.done += r._count._all;
    counts.set(id, c);
  }
  return (id: string) => counts.get(id) ?? { tasks: 0, done: 0 };
}

const project = { select: { id: true, code: true, name: true } };

// ---------- Sprints ----------

export interface SprintInput {
  projectId: string;
  name: string;
  goal?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

export async function listSprints(projectId: string | undefined, projectIds: string[] | null) {
  const sprints = await prisma.sprint.findMany({
    where: inProjects(projectId, projectIds),
    orderBy: [{ startDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    include: { project },
  });
  const count = await taskCounts(
    'sprintId',
    sprints.map((s) => s.id),
  );
  return sprints.map((s) => ({ ...s, ...count(s.id) }));
}

async function getSprint(id: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) throw new HttpError(404, 'Sprint not found');
  return sprint;
}

export async function createSprint(user: AuthUser, input: SprintInput) {
  await requireManage(user, input.projectId);
  return prisma.sprint.create({ data: input });
}

/**
 * Edit a sprint. Starting one needs no other active sprint on the project (one board, one
 * running sprint, as in JIRA). Completing one takes its unfinished tasks out of the sprint.
 */
export async function updateSprint(
  user: AuthUser,
  id: string,
  input: Partial<Omit<SprintInput, 'projectId'>> & { status?: SprintStatus },
) {
  const sprint = await getSprint(id);
  await requireManage(user, sprint.projectId);
  if (input.status === 'ACTIVE' && sprint.status !== 'ACTIVE') {
    const active = await prisma.sprint.findFirst({
      where: { projectId: sprint.projectId, status: 'ACTIVE', id: { not: id } },
      select: { name: true },
    });
    if (active) throw new HttpError(409, `Complete ${active.name} before starting another sprint`);
  }
  const closing = input.status === 'CLOSED' && sprint.status !== 'CLOSED';
  const [updated] = await prisma.$transaction([
    prisma.sprint.update({ where: { id }, data: input }),
    ...(closing
      ? [
          prisma.task.updateMany({
            where: { sprintId: id, status: { not: 'DONE' } },
            data: { sprintId: null },
          }),
        ]
      : []),
  ]);
  return updated;
}

/** Delete a sprint; its tasks stay, out of any sprint. */
export async function deleteSprint(user: AuthUser, id: string) {
  const sprint = await getSprint(id);
  await requireManage(user, sprint.projectId);
  await prisma.sprint.delete({ where: { id } });
}

// ---------- Epics ----------

export interface EpicInput {
  projectId: string;
  name: string;
  description?: string | null;
  color?: string | null;
}

export async function listEpics(projectId: string | undefined, projectIds: string[] | null) {
  const epics = await prisma.epic.findMany({
    where: inProjects(projectId, projectIds),
    orderBy: { createdAt: 'asc' },
    include: { project },
  });
  const count = await taskCounts(
    'epicId',
    epics.map((e) => e.id),
  );
  return epics.map((e) => ({ ...e, ...count(e.id) }));
}

async function getEpic(id: string) {
  const epic = await prisma.epic.findUnique({ where: { id } });
  if (!epic) throw new HttpError(404, 'Epic not found');
  return epic;
}

export async function createEpic(user: AuthUser, input: EpicInput) {
  await requireManage(user, input.projectId);
  return prisma.epic.create({ data: input });
}

export async function updateEpic(
  user: AuthUser,
  id: string,
  input: Partial<Omit<EpicInput, 'projectId'>>,
) {
  const epic = await getEpic(id);
  await requireManage(user, epic.projectId);
  return prisma.epic.update({ where: { id }, data: input });
}

/** Delete an epic; its tasks stay, without an epic. */
export async function deleteEpic(user: AuthUser, id: string) {
  const epic = await getEpic(id);
  await requireManage(user, epic.projectId);
  await prisma.epic.delete({ where: { id } });
}
