/**
 * Utilization rules from the Scope & Implementation Plan:
 * - A task's estimate is spread evenly across the working days (Mon-Fri) between its
 *   start and due dates; each week receives its share.
 * - Utilization % (person, week) = scheduled hours / weekly capacity x 100.
 * - Backlog tasks are not scheduled; done tasks still count.
 * All dates are UTC calendar days (DB `@db.Date` columns come back as UTC midnight).
 */

const DAY_MS = 86_400_000;

/** KPI thresholds. TODO(M2): read from AlertThreshold so admins can configure them. */
export const UNDER_UTILIZED_PCT = 70;
export const OVER_UTILIZED_PCT = 100;
/** Hours in one FTE week, used for "average FTE per week" on the department donut. */
export const FTE_WEEK_HOURS = 40;

export type Band = 'low' | 'moderate' | 'healthy' | 'over';

/** Heat map colour band: <50, 50-80, 80-100, >100 %. */
export function bandOf(pct: number): Band {
  if (pct > 100) return 'over';
  if (pct >= 80) return 'healthy';
  if (pct >= 50) return 'moderate';
  return 'low';
}

export const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStartOf(date: Date): Date {
  const d = startOfUtcDay(date);
  return addDays(d, -((d.getUTCDay() + 6) % 7)); // getUTCDay: 0 = Sunday
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const isWorkingDay = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

export interface SchedulableTask {
  estimateHours: number;
  startDate: Date;
  dueDate: Date;
}

/**
 * Split a task's estimate into hours per week, keyed by the week's Monday (YYYY-MM-DD).
 * Returns an empty map when the task has no working days (e.g. due before start, or a
 * weekend-only range) or no estimate.
 */
export function spreadTaskHours(task: SchedulableTask): Map<string, number> {
  const perWeekDays = new Map<string, number>();
  let total = 0;
  const end = startOfUtcDay(task.dueDate).getTime();
  for (let d = startOfUtcDay(task.startDate); d.getTime() <= end; d = addDays(d, 1)) {
    if (!isWorkingDay(d)) continue;
    const week = isoDate(weekStartOf(d));
    perWeekDays.set(week, (perWeekDays.get(week) ?? 0) + 1);
    total++;
  }

  const hours = new Map<string, number>();
  if (total === 0 || task.estimateHours <= 0) return hours;
  for (const [week, days] of perWeekDays) hours.set(week, (task.estimateHours * days) / total);
  return hours;
}

export const utilizationPct = (hours: number, capacity: number) =>
  capacity > 0 ? (hours / capacity) * 100 : 0;

/** Round for display; calculations keep full precision until the response is built. */
export const round1 = (n: number) => Math.round(n * 10) / 10;
