import { addDays, isoDate, weekStartOf } from '../dashboard/utilization.js';

/**
 * Project status report rules: reporting periods and the health (RAG) rating.
 * Kept free of database code so the rules are easy to read and test.
 */

export type PeriodType = 'week' | 'month';

export interface Period {
  type: PeriodType;
  /** First and last day of the period (UTC calendar days, both included). */
  start: Date;
  end: Date;
  label: string;
  /** A day in the previous / next period, for navigation. */
  previous: string;
  next: string;
}

const dayMonth = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const monthYear = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** ISO-8601 week number. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** The week (Monday to Sunday) or calendar month containing `date`. */
export function periodOf(type: PeriodType, date: Date): Period {
  let start: Date;
  let end: Date;
  let label: string;
  if (type === 'week') {
    start = weekStartOf(date);
    end = addDays(start, 6);
    label = `Week ${isoWeek(start)} · ${dayMonth.format(start)} – ${dayMonth.format(end)} ${end.getUTCFullYear()}`;
  } else {
    start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    label = monthYear.format(start);
  }
  return {
    type,
    start,
    end,
    label,
    previous: isoDate(addDays(start, -1)),
    next: isoDate(addDays(end, 1)),
  };
}

export type Rag = 'green' | 'amber' | 'red';

export interface HealthInput {
  blocked: number;
  blockedCritical: number;
  overdue: number;
  loggedHours: number;
  estimateHours: number;
}

/** Thresholds, shown on the report so the rating is never a mystery. */
export const HEALTH_RULES = {
  redOverdue: 3,
  amberBudgetShare: 0.9,
};

/**
 * Red: a blocked critical task, 3+ overdue tasks, or hours logged above the total estimate.
 * Amber: any blocked or overdue task, or hours logged at 90%+ of the estimate.
 * Green: none of the above.
 */
export function healthOf(h: HealthInput): { rag: Rag; reasons: string[] } {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const red: string[] = [];
  const amber: string[] = [];

  if (h.blockedCritical > 0) red.push(`${plural(h.blockedCritical, 'critical task')} blocked`);
  else if (h.blocked > 0) amber.push(`${plural(h.blocked, 'task')} blocked`);

  if (h.overdue >= HEALTH_RULES.redOverdue) red.push(`${plural(h.overdue, 'task')} overdue`);
  else if (h.overdue > 0) amber.push(`${plural(h.overdue, 'task')} overdue`);

  if (h.estimateHours > 0) {
    const share = h.loggedHours / h.estimateHours;
    const pct = Math.round(share * 100);
    if (share > 1) red.push(`Hours logged are ${pct}% of the estimate`);
    else if (share >= HEALTH_RULES.amberBudgetShare)
      amber.push(`Hours logged are ${pct}% of the estimate`);
  }

  if (red.length) return { rag: 'red', reasons: [...red, ...amber] };
  if (amber.length) return { rag: 'amber', reasons: amber };
  return {
    rag: 'green',
    reasons: ['No blocked or overdue tasks, and hours are within the estimate'],
  };
}
