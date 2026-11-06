import { prisma } from '../../lib/prisma.js';
import { leaveDaysByWeek } from '../leave/leave.service.js';
import { getThresholds, type Thresholds } from '../settings/thresholds.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  addDays,
  bandOf,
  FTE_WEEK_HOURS,
  isoDate,
  round1,
  spreadTaskHours,
  utilizationPct,
  weekStartOf,
} from './utilization.js';

export { weekStartOf } from './utilization.js';

export interface DashboardQuery {
  /** Any day in the first week of the window; defaults to two weeks before the current week. */
  from?: Date;
  weeks: number;
  projectId?: string;
  /** Limit every widget to one person (a team member sees only their own figures). */
  personId?: string;
}

const UNASSIGNED = 'Unassigned';
const WORK_DAYS = 5;
const NO_DEPARTMENT = 'No department';

/**
 * Load people and scheduled tasks once and build the person x week hours grid that every
 * dashboard widget is derived from, so the widgets can never disagree with each other.
 */
async function buildUtilization(query: DashboardQuery, now: Date) {
  const currentWeek = weekStartOf(now);
  const from = query.from ? weekStartOf(query.from) : addDays(currentWeek, -14);
  const weeks = Array.from({ length: query.weeks }, (_, i) => isoDate(addDays(from, i * 7)));
  const windowEnd = addDays(from, query.weeks * 7 - 1);
  const inWindow = new Set(weeks);

  // The KPI counts are always about the current week, even if the window doesn't include it.
  const rangeStart = from < currentWeek ? from : currentWeek;
  const currentWeekEnd = addDays(currentWeek, 6);
  const rangeEnd = windowEnd > currentWeekEnd ? windowEnd : currentWeekEnd;

  const projectFilter: Prisma.TaskWhereInput = {
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.personId ? { assigneeId: query.personId } : {}),
  };

  const [people, tasks, unscheduledTasks, leave, thresholds] = await Promise.all([
    prisma.person.findMany({
      where: query.personId ? { id: query.personId, active: true } : { active: true },
      select: {
        id: true,
        name: true,
        title: true,
        weeklyCapacityHours: true,
        department: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.task.findMany({
      where: {
        ...projectFilter,
        status: { not: 'BACKLOG' },
        estimateHours: { gt: 0 },
        startDate: { not: null, lte: rangeEnd },
        dueDate: { not: null, gte: rangeStart },
      },
      select: {
        estimateHours: true,
        startDate: true,
        dueDate: true,
        assigneeId: true,
        project: { select: { billable: true } },
        assignee: { select: { department: { select: { name: true } } } },
      },
    }),
    // Data-hygiene signal: open tasks that can't be scheduled, so their demand is invisible.
    prisma.task.count({
      where: {
        ...projectFilter,
        status: { notIn: ['BACKLOG', 'DONE'] },
        OR: [{ startDate: null }, { dueDate: null }, { estimateHours: null }],
      },
    }),
    leaveDaysByWeek(rangeStart, addDays(rangeEnd, 6), query.personId),
    getThresholds(),
  ]);

  const personWeek = new Map<string, Map<string, number>>();
  const weekDemand = new Map<string, number>();
  const weekUnassigned = new Map<string, number>();
  const deptHours = new Map<string, number>();
  let billable = 0;
  let nonBillable = 0;

  for (const task of tasks) {
    const spread = spreadTaskHours({
      estimateHours: Number(task.estimateHours),
      startDate: task.startDate!,
      dueDate: task.dueDate!,
    });
    const dept = task.assigneeId ? (task.assignee?.department?.name ?? NO_DEPARTMENT) : UNASSIGNED;

    for (const [week, hours] of spread) {
      if (task.assigneeId) {
        const row = personWeek.get(task.assigneeId) ?? new Map<string, number>();
        row.set(week, (row.get(week) ?? 0) + hours);
        personWeek.set(task.assigneeId, row);
      }
      if (!inWindow.has(week)) continue;

      weekDemand.set(week, (weekDemand.get(week) ?? 0) + hours);
      if (!task.assigneeId) weekUnassigned.set(week, (weekUnassigned.get(week) ?? 0) + hours);
      deptHours.set(dept, (deptHours.get(dept) ?? 0) + hours);
      if (task.project.billable) billable += hours;
      else nonBillable += hours;
    }
  }

  const rows = people.map((p) => {
    const capacityHours = Number(p.weeklyCapacityHours);
    const leaveByWeek = leave.get(p.id) ?? new Map<string, number>();
    return {
      personId: p.id,
      name: p.name,
      title: p.title,
      department: p.department?.name ?? NO_DEPARTMENT,
      capacityHours,
      hoursByWeek: personWeek.get(p.id) ?? new Map<string, number>(),
      leaveDays: (week: string) => leaveByWeek.get(week) ?? 0,
      /** Each working day of leave takes a fifth of the weekly capacity. */
      capacityIn: (week: string) =>
        (capacityHours * Math.max(0, WORK_DAYS - (leaveByWeek.get(week) ?? 0))) / WORK_DAYS,
    };
  });
  const teamCapacityIn = (week: string) => rows.reduce((sum, r) => sum + r.capacityIn(week), 0);

  return {
    currentWeek: isoDate(currentWeek),
    from: isoDate(from),
    to: isoDate(windowEnd),
    weeks,
    rows,
    teamCapacity: rows.reduce((sum, r) => sum + r.capacityHours, 0),
    teamCapacityIn,
    weekDemand,
    weekUnassigned,
    deptHours,
    billable,
    nonBillable,
    unscheduledTasks,
    thresholds,
  };
}

type Utilization = Awaited<ReturnType<typeof buildUtilization>>;

const windowOf = (u: Utilization) => ({
  from: u.from,
  to: u.to,
  weeks: u.weeks.length,
  currentWeek: u.currentWeek,
});

function kpis(u: Utilization) {
  let underUtilized = 0;
  let overUtilized = 0;
  let onBench = 0;
  for (const r of u.rows) {
    const hours = r.hoursByWeek.get(u.currentWeek) ?? 0;
    const capacity = r.capacityIn(u.currentWeek);
    const pct = utilizationPct(hours, capacity);
    if (capacity === 0) {
      // On leave all week: not on the bench, but any work planned for them is too much.
      if (hours > 0) overUtilized++;
    } else if (hours === 0) onBench++;
    else if (pct < u.thresholds.underUtilizedPct) underUtilized++;
    else if (pct > u.thresholds.overUtilizedPct) overUtilized++;
  }
  return {
    window: windowOf(u),
    teamSize: u.rows.length,
    totalDemandHours: round1(u.billable + u.nonBillable),
    billableDemandHours: round1(u.billable),
    nonBillableDemandHours: round1(u.nonBillable),
    underUtilized,
    overUtilized,
    onBench,
    unscheduledTasks: u.unscheduledTasks,
    thresholds: u.thresholds satisfies Thresholds,
  };
}

function demandVsAvailability(u: Utilization) {
  return {
    window: windowOf(u),
    weeks: u.weeks.map((week) => {
      const demand = u.weekDemand.get(week) ?? 0;
      const capacity = u.teamCapacityIn(week);
      const demandPct = utilizationPct(demand, capacity);
      return {
        weekStart: week,
        isCurrent: week === u.currentWeek,
        capacityHours: round1(capacity),
        demandHours: round1(demand),
        unassignedHours: round1(u.weekUnassigned.get(week) ?? 0),
        demandPct: round1(demandPct),
        availabilityPct: round1(Math.max(0, 100 - demandPct)),
      };
    }),
  };
}

function departments(u: Utilization) {
  return {
    window: windowOf(u),
    departments: [...u.deptHours]
      .map(([department, hours]) => ({
        department,
        hours: round1(hours),
        avgFtePerWeek: round1(hours / FTE_WEEK_HOURS / u.weeks.length),
      }))
      .sort((a, b) => b.hours - a.hours),
  };
}

function heatmap(u: Utilization) {
  const cell = (week: string, hours: number, capacity: number, leaveDays = 0) => {
    const pct = utilizationPct(hours, capacity);
    // Fully on leave: no percentage; any planned work makes the week over-allocated.
    const band = capacity === 0 && leaveDays > 0 ? (hours > 0 ? 'over' : 'leave') : bandOf(pct);
    return {
      weekStart: week,
      hours: round1(hours),
      capacityHours: round1(capacity),
      leaveDays,
      pct: round1(pct),
      band,
    };
  };
  return {
    window: windowOf(u),
    weeks: u.weeks,
    rows: u.rows.map((r) => ({
      personId: r.personId,
      name: r.name,
      title: r.title,
      department: r.department,
      capacityHours: r.capacityHours,
      cells: u.weeks.map((w) =>
        cell(w, r.hoursByWeek.get(w) ?? 0, r.capacityIn(w), r.leaveDays(w)),
      ),
    })),
    // Sum of the people rows; unassigned work is reported on the demand chart instead.
    total: {
      capacityHours: u.teamCapacity,
      cells: u.weeks.map((w) =>
        cell(
          w,
          u.rows.reduce((sum, r) => sum + (r.hoursByWeek.get(w) ?? 0), 0),
          u.teamCapacityIn(w),
          u.rows.reduce((sum, r) => sum + r.leaveDays(w), 0),
        ),
      ),
    },
  };
}

export const getKpis = async (q: DashboardQuery, now = new Date()) =>
  kpis(await buildUtilization(q, now));

export const getDemandVsAvailability = async (q: DashboardQuery, now = new Date()) =>
  demandVsAvailability(await buildUtilization(q, now));

export const getDepartments = async (q: DashboardQuery, now = new Date()) =>
  departments(await buildUtilization(q, now));

export const getHeatmap = async (q: DashboardQuery, now = new Date()) =>
  heatmap(await buildUtilization(q, now));

/** All four widgets from one load, for the dashboard page. */
export async function getOverview(q: DashboardQuery, now = new Date()) {
  const u = await buildUtilization(q, now);
  const { window, ...kpiTiles } = kpis(u);
  return {
    window,
    kpis: kpiTiles,
    demandVsAvailability: demandVsAvailability(u).weeks,
    departments: departments(u).departments,
    heatmap: (({ rows, total }) => ({ rows, total }))(heatmap(u)),
  };
}
