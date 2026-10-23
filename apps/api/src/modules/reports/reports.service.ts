import { prisma } from '../../lib/prisma.js';
import type { TaskStatus } from '../../generated/prisma/enums.js';
import { addDays, isoDate, round1, taskHoursInRange } from '../dashboard/utilization.js';
import { taskKey } from '../tasks/tasks.service.js';
import { healthOf, periodOf, type PeriodType } from './report.js';

export interface ReportQuery {
  period: PeriodType;
  /** Any day in the period; defaults to today. */
  date?: Date;
  projectId?: string;
}

const OPEN = (s: TaskStatus) => s !== 'DONE';
const endOfDay = (d: Date) => new Date(d.getTime() + 86_400_000 - 1);

/**
 * Weekly or monthly status report per project: health, the period's numbers, the tasks that
 * matter (completed, in progress, due next, blocked, overdue) and who logged time.
 * `projectIds` limits the report to a team member's own projects (null = all).
 */
export async function statusReport(q: ReportQuery, projectIds: string[] | null, now = new Date()) {
  const period = periodOf(q.period, q.date ?? now);
  const periodEnd = endOfDay(period.end);
  // Overdue is judged at the end of the period, or today for the period in progress.
  const asOf = periodEnd < now ? periodEnd : now;
  const asOfDay = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const nextPeriod = periodOf(q.period, addDays(period.end, 1));

  const projects = await prisma.project.findMany({
    // A team member's own projects only (null = all), narrowed to one project if asked.
    where: projectIds
      ? { id: { in: q.projectId ? projectIds.filter((id) => id === q.projectId) : projectIds } }
      : q.projectId
        ? { id: q.projectId }
        : {},
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      client: true,
      billable: true,
      status: true,
      owner: { select: { name: true } },
    },
  });
  const ids = projects.map((p) => p.id);

  const [tasks, periodLogs, loggedToDate] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: { in: ids } },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        priority: true,
        projectId: true,
        estimateHours: true,
        startDate: true,
        dueDate: true,
        completedAt: true,
        assignee: { select: { id: true, name: true } },
      },
    }),
    prisma.worklog.findMany({
      where: { date: { gte: period.start, lte: period.end }, task: { projectId: { in: ids } } },
      select: {
        hours: true,
        person: { select: { id: true, name: true } },
        task: { select: { projectId: true } },
      },
    }),
    prisma.worklog.groupBy({
      by: ['taskId'],
      where: { date: { lte: asOf }, task: { projectId: { in: ids } } },
      _sum: { hours: true },
    }),
  ]);
  const loggedByTask = new Map(loggedToDate.map((l) => [l.taskId, Number(l._sum.hours ?? 0)]));

  const item = (t: (typeof tasks)[number]) => ({
    key: taskKey(t.number),
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee?.name ?? null,
    dueDate: t.dueDate ? isoDate(t.dueDate) : null,
    completedAt: t.completedAt ? isoDate(t.completedAt) : null,
    estimateHours: Number(t.estimateHours ?? 0),
  });
  const byDue = (a: { dueDate: Date | null }, b: { dueDate: Date | null }) =>
    (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
  const inRange = (d: Date | null, from: Date, to: Date) => !!d && d >= from && d <= to;
  // Open at the reporting moment: not done, or completed only after it.
  const openAt = (t: (typeof tasks)[number]) =>
    OPEN(t.status) || (!!t.completedAt && t.completedAt > asOf);

  const reports = projects.map((p) => {
    const mine = tasks.filter((t) => t.projectId === p.id);
    const completed = mine
      .filter((t) => inRange(t.completedAt, period.start, periodEnd))
      .sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime());
    const overdue = mine.filter((t) => openAt(t) && !!t.dueDate && t.dueDate < asOfDay).sort(byDue);
    const blocked = mine.filter((t) => t.status === 'BLOCKED').sort(byDue);
    const inProgress = mine
      .filter((t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW')
      .sort(byDue);
    const dueNext = mine
      .filter(
        (t) => OPEN(t.status) && inRange(t.dueDate, nextPeriod.start, endOfDay(nextPeriod.end)),
      )
      .sort(byDue);

    // Planned hours in the period, by the dashboard's rules (backlog isn't scheduled).
    const team = new Map<string, { name: string; logged: number; planned: number }>();
    const member = (id: string, name: string) => {
      if (!team.has(id)) team.set(id, { name, logged: 0, planned: 0 });
      return team.get(id)!;
    };
    let planned = 0;
    for (const t of mine) {
      if (t.status === 'BACKLOG' || !t.startDate || !t.dueDate || !t.estimateHours) continue;
      const h = taskHoursInRange(
        { estimateHours: Number(t.estimateHours), startDate: t.startDate, dueDate: t.dueDate },
        period.start,
        period.end,
      );
      planned += h;
      if (h > 0 && t.assignee) member(t.assignee.id, t.assignee.name).planned += h;
    }
    let loggedInPeriod = 0;
    for (const w of periodLogs) {
      if (w.task.projectId !== p.id) continue;
      loggedInPeriod += Number(w.hours);
      member(w.person.id, w.person.name).logged += Number(w.hours);
    }

    const estimateHours = mine.reduce((s, t) => s + Number(t.estimateHours ?? 0), 0);
    const loggedHours = mine.reduce((s, t) => s + (loggedByTask.get(t.id) ?? 0), 0);
    const health = healthOf({
      blocked: blocked.length,
      blockedCritical: blocked.filter((t) => t.priority === 'CRITICAL').length,
      overdue: overdue.length,
      loggedHours,
      estimateHours,
    });

    return {
      project: {
        id: p.id,
        code: p.code,
        name: p.name,
        client: p.client,
        billable: p.billable,
        status: p.status,
        owner: p.owner?.name ?? null,
      },
      health,
      metrics: {
        completed: completed.length,
        open: mine.filter(openAt).length,
        inProgress: inProgress.length,
        blocked: blocked.length,
        overdue: overdue.length,
        plannedHours: round1(planned),
        loggedHours: round1(loggedInPeriod),
        estimateToDate: round1(estimateHours),
        loggedToDate: round1(loggedHours),
      },
      completed: completed.map(item),
      inProgress: inProgress.map(item),
      dueNext: dueNext.map(item),
      blocked: blocked.map(item),
      overdue: overdue.map(item),
      team: [...team.values()]
        .map((m) => ({
          name: m.name,
          loggedHours: round1(m.logged),
          plannedHours: round1(m.planned),
        }))
        .sort((a, b) => b.loggedHours - a.loggedHours || b.plannedHours - a.plannedHours),
    };
  });

  return {
    period: {
      type: period.type,
      start: isoDate(period.start),
      end: isoDate(period.end),
      label: period.label,
      previous: period.previous,
      next: period.next,
      nextLabel: nextPeriod.label,
      asOf: isoDate(asOfDay),
    },
    generatedAt: now.toISOString(),
    totals: {
      projects: reports.length,
      red: reports.filter((r) => r.health.rag === 'red').length,
      amber: reports.filter((r) => r.health.rag === 'amber').length,
      green: reports.filter((r) => r.health.rag === 'green').length,
      completed: reports.reduce((s, r) => s + r.metrics.completed, 0),
      loggedHours: round1(reports.reduce((s, r) => s + r.metrics.loggedHours, 0)),
      plannedHours: round1(reports.reduce((s, r) => s + r.metrics.plannedHours, 0)),
      overdue: reports.reduce((s, r) => s + r.metrics.overdue, 0),
      blocked: reports.reduce((s, r) => s + r.metrics.blocked, 0),
    },
    projects: reports,
  };
}
