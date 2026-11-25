import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { isoDate, round1, startOfUtcDay } from '../dashboard/utilization.js';
import { healthOf } from '../reports/report.js';
import { forecastOf } from './forecast.js';

export interface PortfolioQuery {
  /** Only projects this team works on: one of its members leads it, is staffed on it or has a task on it. */
  teamId?: string;
  /** Include completed and cancelled projects (left out by default). */
  includeClosed?: boolean;
}

const CLOSED = ['COMPLETED', 'CANCELLED'] as const;

/**
 * Portfolio overview (phase 1): every project with its lead, progress, health and a forecast of
 * when its planned work ends against the date promised. `projectIds` limits it to a team
 * member's own projects (null = all).
 */
export async function portfolio(q: PortfolioQuery, projectIds: string[] | null, now = new Date()) {
  const today = startOfUtcDay(now);

  const where: Prisma.ProjectWhereInput = {};
  if (projectIds) where.id = { in: projectIds };
  if (!q.includeClosed) where.status = { notIn: [...CLOSED] };
  if (q.teamId) {
    const onTeam = { teamMemberships: { some: { teamId: q.teamId } } };
    where.OR = [
      { owner: onTeam },
      { members: { some: { person: onTeam } } },
      { tasks: { some: { assignee: onTeam } } },
    ];
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      client: true,
      status: true,
      startDate: true,
      endDate: true,
      owner: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
  });
  const ids = projects.map((p) => p.id);

  const [tasks, logged] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: { in: ids } },
      select: {
        id: true,
        projectId: true,
        status: true,
        priority: true,
        estimateHours: true,
        dueDate: true,
        completedAt: true,
      },
    }),
    prisma.worklog.groupBy({
      by: ['taskId'],
      where: { task: { projectId: { in: ids } } },
      _sum: { hours: true },
    }),
  ]);
  // Logged hours per project, via each task's project.
  const taskProject = new Map(tasks.map((t) => [t.id, t.projectId]));
  const loggedByProject = new Map<string, number>();
  for (const l of logged) {
    const pid = taskProject.get(l.taskId)!;
    loggedByProject.set(pid, (loggedByProject.get(pid) ?? 0) + Number(l._sum.hours ?? 0));
  }

  const rows = projects.map((p) => {
    const mine = tasks.filter((t) => t.projectId === p.id);
    const done = mine.filter((t) => t.status === 'DONE');
    const open = mine.filter((t) => t.status !== 'DONE');
    const blocked = open.filter((t) => t.status === 'BLOCKED');
    const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
    const hours = (list: typeof mine) => list.reduce((s, t) => s + Number(t.estimateHours ?? 0), 0);
    const estimateHours = hours(mine);
    const loggedHours = loggedByProject.get(p.id) ?? 0;

    return {
      project: {
        id: p.id,
        code: p.code,
        name: p.name,
        client: p.client,
        status: p.status,
        startDate: p.startDate ? isoDate(p.startDate) : null,
        endDate: p.endDate ? isoDate(p.endDate) : null,
        lead: p.owner,
        people: p._count.members,
      },
      progress: {
        tasks: mine.length,
        done: done.length,
        open: open.length,
        blocked: blocked.length,
        overdue: overdue.length,
        estimateHours: round1(estimateHours),
        doneHours: round1(hours(done)),
        remainingHours: round1(hours(open)),
        loggedHours: round1(loggedHours),
      },
      health: healthOf({
        blocked: blocked.length,
        blockedCritical: blocked.filter((t) => t.priority === 'CRITICAL').length,
        overdue: overdue.length,
        loggedHours,
        estimateHours,
      }),
      forecast: forecastOf(
        mine.map((t) => ({
          done: t.status === 'DONE',
          dueDate: t.dueDate,
          completedAt: t.completedAt,
        })),
        p.endDate,
        now,
      ),
    };
  });

  const late = rows.filter((r) => r.forecast.state === 'late');
  return {
    asOf: isoDate(today),
    totals: {
      projects: rows.length,
      late: late.length,
      daysLate: late.reduce((s, r) => s + r.forecast.daysLate!, 0),
      onTime: rows.filter((r) => r.forecast.state === 'on_time').length,
      noPromise: rows.filter((r) => r.forecast.state === 'no_promise').length,
      noPlan: rows.filter((r) => r.forecast.state === 'no_plan').length,
      done: rows.filter((r) => r.forecast.state === 'done').length,
      red: rows.filter((r) => r.health.rag === 'red').length,
      amber: rows.filter((r) => r.health.rag === 'amber').length,
      green: rows.filter((r) => r.health.rag === 'green').length,
    },
    projects: rows,
  };
}
