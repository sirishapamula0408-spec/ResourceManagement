import type { TaskStatus } from '../../generated/prisma/enums.js';
import { HttpError } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Sprint burndown (M4 JIRA-lite): for each day of the sprint, the work still open at the end of
 * that day, next to an ideal straight line from the full scope down to zero on the last day.
 *
 * Reconstruction, per task and per day (UTC calendar days, like every date in the app):
 * - The task history (AuditLog "task.update" entries, each with before and after values) gives a
 *   task's status and sprint at any moment: the "after" of the last change up to then, or the
 *   "before" of the first change after it. That is exact from the day history was first recorded.
 * - Where a task has no recorded status change, Done comes from `completedAt` (done if completed
 *   before the end of the day); where it has no recorded sprint change, its current sprint is taken
 *   to have held for the whole sprint. So for days before history was recorded the figures are an
 *   approximation: e.g. a task moved into the sprint then shows from the first day.
 * - A task with a recorded creation counts from the day it was created; one without (created
 *   before history, or by the seed) counts from the start.
 * - Hours are the tasks' current estimates (estimate changes aren't replayed); tasks without an
 *   estimate count as 0 hours but still count as tasks. Deleted tasks are left out.
 */

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const utcMidnight = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const round = (n: number) => Math.round(n * 100) / 100;

interface Change {
  at: Date;
  before: unknown;
  after: unknown;
}

/** A field's value at a moment from its recorded changes (undefined: nothing recorded). */
function valueAt(changes: Change[], at: Date) {
  if (!changes.length) return undefined;
  const last = changes.filter((c) => c.at < at).pop();
  return last ? last.after : changes[0].before;
}

export interface BurndownDay {
  date: string;
  /** Null for days after today. */
  remainingHours: number | null;
  remainingTasks: number | null;
  idealHours: number;
  idealTasks: number;
}

/**
 * Burndown of one sprint, every day from its start to its end date. Days after today (or after
 * the day a completed sprint was completed) are listed for the ideal line, with null remaining work. `projectIds` limits a team member to their
 * projects (null = every project).
 */
export async function sprintBurndown(
  sprintId: string,
  projectIds: string[] | null,
  now = new Date(),
) {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || (projectIds && !projectIds.includes(sprint.projectId))) {
    throw new HttpError(404, 'Sprint not found');
  }
  if (!sprint.startDate || !sprint.endDate) {
    throw new HttpError(400, 'Give the sprint a start and an end date to see its burndown');
  }

  // Tasks in the sprint now, or ever moved in or out of it.
  const mentioning = await prisma.auditLog.findMany({
    where: {
      entityType: 'Task',
      action: 'task.update',
      OR: [
        { before: { path: ['sprintId'], equals: sprintId } },
        { after: { path: ['sprintId'], equals: sprintId } },
      ],
    },
    select: { entityId: true },
  });
  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { sprintId },
        { id: { in: mentioning.map((m) => m.entityId).filter((id): id is string => !!id) } },
      ],
    },
    select: { id: true, status: true, sprintId: true, estimateHours: true, completedAt: true },
  });
  const entries = await prisma.auditLog.findMany({
    where: {
      entityType: 'Task',
      entityId: { in: tasks.map((t) => t.id) },
      action: { in: ['task.create', 'task.update'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { entityId: true, action: true, createdAt: true, before: true, after: true },
  });

  const timeline = tasks.map((t) => {
    const mine = entries.filter((e) => e.entityId === t.id);
    const changesOf = (field: 'status' | 'sprintId') =>
      mine
        .filter((e) => e.action === 'task.update' && e.after && field in (e.after as object))
        .map((e) => ({
          at: e.createdAt,
          before: (e.before as Record<string, unknown> | null)?.[field] ?? null,
          after: (e.after as Record<string, unknown>)[field] ?? null,
        }));
    return {
      task: t,
      hours: Number(t.estimateHours ?? 0),
      createdAt: mine.find((e) => e.action === 'task.create')?.createdAt ?? null,
      status: changesOf('status'),
      sprint: changesOf('sprintId'),
    };
  });

  /** Scope and open work at a moment. */
  const at = (moment: Date) => {
    let scopeHours = 0;
    let scopeTasks = 0;
    let openHours = 0;
    let openTasks = 0;
    for (const { task, hours, createdAt, status, sprint } of timeline) {
      if (createdAt && createdAt >= moment) continue;
      const recordedSprint = valueAt(sprint, moment); // null = in no sprint
      const inSprint = (recordedSprint === undefined ? task.sprintId : recordedSprint) === sprintId;
      if (!inSprint) continue;
      const recorded = valueAt(status, moment) as TaskStatus | undefined;
      const done =
        recorded !== undefined
          ? recorded === 'DONE'
          : task.status === 'DONE' && (!task.completedAt || task.completedAt < moment);
      scopeHours += hours;
      scopeTasks += 1;
      if (!done) {
        openHours += hours;
        openTasks += 1;
      }
    }
    return { scopeHours, scopeTasks, openHours, openTasks };
  };

  const start = utcMidnight(sprint.startDate);
  const end = utcMidnight(sprint.endDate);
  const span = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  // Measured up to now, or for a completed sprint up to its completion (approximately its last
  // update): completing it takes the unfinished tasks out, which must not read as "all done".
  const until = sprint.status === 'CLOSED' ? new Date(Math.min(+sprint.updatedAt - 1, +now)) : now;
  const lastDay = utcMidnight(until);
  const moment = (day: Date) => new Date(Math.min(day.getTime() + DAY, until.getTime()));
  // Scope: the sprint as it stands on its latest day so far.
  const scope = at(moment(lastDay < start ? start : lastDay > end ? end : lastDay));
  const ideal = (total: number, i: number) => round(span > 1 ? total * (1 - i / (span - 1)) : 0);

  const days: BurndownDay[] = Array.from({ length: span }, (_, i) => {
    const day = new Date(start.getTime() + i * DAY);
    const open = day > lastDay ? null : at(moment(day));
    return {
      date: isoDay(day),
      remainingHours: open && round(open.openHours),
      remainingTasks: open && open.openTasks,
      idealHours: ideal(scope.scopeHours, i),
      idealTasks: ideal(scope.scopeTasks, i),
    };
  });

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      startDate: isoDay(start),
      endDate: isoDay(end),
    },
    days,
    totalHours: round(scope.scopeHours),
    totalTasks: scope.scopeTasks,
  };
}
