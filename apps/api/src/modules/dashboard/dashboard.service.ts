import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  addDays,
  bandOf,
  FTE_WEEK_HOURS,
  isoDate,
  OVER_UTILIZED_PCT,
  round1,
  spreadTaskHours,
  UNDER_UTILIZED_PCT,
  utilizationPct,
  weekStartOf,
} from './utilization.js';

export { weekStartOf } from './utilization.js';

export interface DashboardQuery {
  /** Any day in the first week of the window; defaults to two weeks before the current week. */
  from?: Date;
  weeks: number;
  projectId?: string;
}

const UNASSIGNED = 'Unassigned';
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

  const projectFilter: Prisma.TaskWhereInput = query.projectId
    ? { projectId: query.projectId }
    : {};

  const [people, tasks, unscheduledTasks] = await Promise.all([
    prisma.person.findMany({
      where: { active: true },
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

  const rows = people.map((p) => ({
    personId: p.id,
    name: p.name,
    title: p.title,
    department: p.department?.name ?? NO_DEPARTMENT,
    capacityHours: Number(p.weeklyCapacityHours),
    hoursByWeek: personWeek.get(p.id) ?? new Map<string, number>(),
  }));

  return {
    currentWeek: isoDate(currentWeek),
    from: isoDate(from),
    to: isoDate(windowEnd),
    weeks,
    rows,
    teamCapacity: rows.reduce((sum, r) => sum + r.capacityHours, 0),
    weekDemand,
    weekUnassigned,
    deptHours,
    billable,
    nonBillable,
    unscheduledTasks,
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
    const pct = utilizationPct(hours, r.capacityHours);
    if (hours === 0) onBench++;
    else if (pct < UNDER_UTILIZED_PCT) underUtilized++;
    else if (pct > OVER_UTILIZED_PCT) overUtilized++;
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
    thresholds: { underUtilizedPct: UNDER_UTILIZED_PCT, overUtilizedPct: OVER_UTILIZED_PCT },
  };
}

function demandVsAvailability(u: Utilization) {
  return {
    window: windowOf(u),
    weeks: u.weeks.map((week) => {
      const demand = u.weekDemand.get(week) ?? 0;
      const demandPct = utilizationPct(demand, u.teamCapacity);
      return {
        weekStart: week,
        isCurrent: week === u.currentWeek,
        capacityHours: round1(u.teamCapacity),
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
  const cell = (week: string, hours: number, capacity: number) => {
    const pct = utilizationPct(hours, capacity);
    return { weekStart: week, hours: round1(hours), pct: round1(pct), band: bandOf(pct) };
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
      cells: u.weeks.map((w) => cell(w, r.hoursByWeek.get(w) ?? 0, r.capacityHours)),
    })),
    // Sum of the people rows; unassigned work is reported on the demand chart instead.
    total: {
      capacityHours: u.teamCapacity,
      cells: u.weeks.map((w) =>
        cell(
          w,
          u.rows.reduce((sum, r) => sum + (r.hoursByWeek.get(w) ?? 0), 0),
          u.teamCapacity,
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

/** Simple counts kept from the skeleton (allocation-based); superseded by the KPI endpoints. */
export async function getSummary(now = new Date()) {
  const weekStart = weekStartOf(now);

  const [people, activeProjects, openTasks, tasksByStatus, capacity, allocated] = await Promise.all(
    [
      prisma.person.count({ where: { active: true } }),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.task.count({ where: { status: { not: 'DONE' } } }),
      prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.person.aggregate({ where: { active: true }, _sum: { weeklyCapacityHours: true } }),
      prisma.allocation.aggregate({ where: { weekStart }, _sum: { hours: true } }),
    ],
  );

  const capacityHours = Number(capacity._sum.weeklyCapacityHours ?? 0);
  const allocatedHours = Number(allocated._sum.hours ?? 0);

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    people,
    activeProjects,
    openTasks,
    capacityHours,
    allocatedHours,
    utilizationPct: capacityHours ? Math.round((allocatedHours / capacityHours) * 1000) / 10 : 0,
    tasksByStatus: Object.fromEntries(tasksByStatus.map((t) => [t.status, t._count._all])),
  };
}
