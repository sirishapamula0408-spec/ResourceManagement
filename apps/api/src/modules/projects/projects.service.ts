import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import type { ProjectStatus } from '../../generated/prisma/enums.js';

/** All projects, or only `projectIds` (a team member's own projects). */
export async function listProjects(projectIds: string[] | null = null) {
  const projects = await prisma.project.findMany({
    where: projectIds ? { id: { in: projectIds } } : undefined,
    orderBy: { code: 'asc' },
    include: {
      owner: { select: { id: true, name: true } },
      members: {
        orderBy: { person: { name: 'asc' } },
        select: { person: { select: { id: true, name: true } } },
      },
      _count: { select: { tasks: true, allocations: true } },
    },
  });

  // Task roll-ups for the projects table: open tasks, estimated and logged hours.
  const [taskStats, openStats, logged] = await Promise.all([
    prisma.task.groupBy({ by: ['projectId'], _sum: { estimateHours: true } }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { status: { not: 'DONE' } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ projectId: string; hours: number }[]>`
      SELECT t."projectId", COALESCE(SUM(w.hours), 0)::float AS hours
      FROM "Worklog" w JOIN "Task" t ON t.id = w."taskId"
      GROUP BY t."projectId"`,
  ]);
  const estimate = new Map(taskStats.map((s) => [s.projectId, Number(s._sum.estimateHours ?? 0)]));
  const open = new Map(openStats.map((s) => [s.projectId, s._count._all]));
  const loggedHours = new Map(logged.map((l) => [l.projectId, Number(l.hours)]));

  return projects.map(({ members, ...p }) => ({
    ...p,
    members: members.map((m) => m.person),
    openTasks: open.get(p.id) ?? 0,
    estimateHours: estimate.get(p.id) ?? 0,
    loggedHours: loggedHours.get(p.id) ?? 0,
  }));
}

export interface ProjectInput {
  code: string;
  name: string;
  client?: string | null;
  billable?: boolean;
  description?: string | null;
  status?: ProjectStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  ownerId?: string | null;
}

export function createProject(input: ProjectInput) {
  return prisma.project.create({ data: input });
}

export function updateProject(id: string, input: Partial<ProjectInput>) {
  return prisma.project.update({ where: { id }, data: input });
}

/** Projects with tasks are kept for history: close them (status) instead of deleting. */
export async function deleteProject(id: string) {
  const tasks = await prisma.task.count({ where: { projectId: id } });
  if (tasks > 0) {
    throw new HttpError(
      409,
      `This project has ${tasks} task${tasks === 1 ? '' : 's'}. Set its status to Completed or Cancelled instead.`,
    );
  }
  await prisma.project.delete({ where: { id } });
}

/** Replace the set of people staffed on a project. */
export async function setProjectMembers(projectId: string, personIds: string[]) {
  await prisma.$transaction([
    prisma.projectMember.deleteMany({ where: { projectId, personId: { notIn: personIds } } }),
    prisma.projectMember.createMany({
      data: personIds.map((personId) => ({ projectId, personId })),
      skipDuplicates: true,
    }),
  ]);
}
