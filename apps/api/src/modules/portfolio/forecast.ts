import { addDays, isoDate, startOfUtcDay, workingDaysBetween } from '../dashboard/utilization.js';

/**
 * Portfolio forecast, phase 1: when a project's planned work ends, set against the date it was
 * promised (the project's end date). Kept free of database code so the rules are easy to test.
 *
 * - Planned finish: the latest due date among the open (not Done) tasks. An overdue open task
 *   can't finish in the past, so it counts as finishing today.
 * - Open tasks without a due date can't be placed, so they are counted as unscheduled.
 * - Late / spare is measured in working days (Mon-Fri) between the planned finish and the
 *   promised date.
 *
 * A later phase replaces the planned finish with one driven by people's free capacity.
 */

export type ForecastState =
  /** Every task is done. */
  | 'done'
  /** Planned to finish on or before the promised date. */
  | 'on_time'
  /** Planned to finish after the promised date. */
  | 'late'
  /** Open work, but the project has no end date to compare with. */
  | 'no_promise'
  /** Open work, but none of it has a due date. */
  | 'no_plan';

export interface ForecastTask {
  done: boolean;
  dueDate: Date | null;
  completedAt: Date | null;
}

export interface Forecast {
  state: ForecastState;
  /** The promised date (the project's end date). */
  promised: string | null;
  /** When the planned work ends; when it ended, for a finished project. */
  finish: string | null;
  /** Working days after the promised date (late), or before it (spare, negative). */
  daysLate: number | null;
  /** Open tasks without a due date. */
  unscheduled: number;
}

/** Working days from the day after `from` up to and including `to`. */
const workingDaysAfter = (from: Date, to: Date) => workingDaysBetween(addDays(from, 1), to);

export function forecastOf(
  tasks: ForecastTask[],
  promisedDate: Date | null,
  now = new Date(),
): Forecast {
  const today = startOfUtcDay(now);
  const promised = promisedDate ? startOfUtcDay(promisedDate) : null;
  const open = tasks.filter((t) => !t.done);
  const unscheduled = open.filter((t) => !t.dueDate).length;

  let finish: Date | null = null;
  if (open.length === 0) {
    const completed = tasks.flatMap((t) => (t.completedAt ? [startOfUtcDay(t.completedAt)] : []));
    if (completed.length) finish = new Date(Math.max(...completed.map((d) => d.getTime())));
  } else {
    for (const t of open) {
      if (!t.dueDate) continue;
      const due = startOfUtcDay(t.dueDate);
      const end = due < today ? today : due;
      if (!finish || end > finish) finish = end;
    }
  }

  const daysLate =
    finish && promised
      ? finish > promised
        ? workingDaysAfter(promised, finish)
        : -workingDaysAfter(finish, promised)
      : null;

  let state: ForecastState;
  if (tasks.length > 0 && open.length === 0) state = 'done';
  else if (!promised) state = 'no_promise';
  else if (!finish) state = 'no_plan';
  else state = daysLate! > 0 ? 'late' : 'on_time';

  return {
    state,
    promised: promised ? isoDate(promised) : null,
    finish: finish ? isoDate(finish) : null,
    daysLate,
    unscheduled,
  };
}
