import type { LeaveType } from '../../generated/prisma/enums.js';
import { HttpError } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { addDays, isoDate, startOfUtcDay, weekStartOf } from '../dashboard/utilization.js';

const include = { person: { select: { id: true, name: true } } };

export interface LeaveFilter {
  /** Only this person's leave (a team member sees only their own). */
  personId?: string;
  /** Leave that overlaps this range. */
  from?: Date;
  to?: Date;
}

export function listLeave({ personId, from, to }: LeaveFilter) {
  return prisma.leave.findMany({
    where: {
      ...(personId ? { personId } : {}),
      ...(to ? { startDate: { lte: to } } : {}),
      ...(from ? { endDate: { gte: from } } : {}),
      person: { active: true },
    },
    orderBy: [{ startDate: 'desc' }, { person: { name: 'asc' } }],
    include,
  });
}

export interface LeaveInput {
  personId: string;
  startDate: Date;
  endDate: Date;
  type: LeaveType;
  note?: string | null;
}

export function findLeave(id: string) {
  return prisma.leave.findUniqueOrThrow({ where: { id } });
}

async function requireActivePerson(personId: string) {
  const ok = await prisma.person.count({ where: { id: personId, active: true } });
  if (!ok) throw new HttpError(400, 'Unknown or removed person');
}

export async function createLeave(input: LeaveInput) {
  await requireActivePerson(input.personId);
  return prisma.leave.create({ data: input, include });
}

export function updateLeave(id: string, input: Partial<Omit<LeaveInput, 'personId'>>) {
  return prisma.leave.update({ where: { id }, data: input, include });
}

export async function deleteLeave(id: string) {
  await prisma.leave.delete({ where: { id } });
}

const isWorkingDay = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

/**
 * Working days of leave per person and week (keyed by the week's Monday), between `from` and
 * `to`. Overlapping leave entries count each day once.
 */
export async function leaveDaysByWeek(
  from: Date,
  to: Date,
  personId?: string,
): Promise<Map<string, Map<string, number>>> {
  const rows = await prisma.leave.findMany({
    where: {
      ...(personId ? { personId } : {}),
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: { personId: true, startDate: true, endDate: true },
  });
  const days = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = days.get(r.personId) ?? new Set<string>();
    const start = r.startDate > from ? r.startDate : from;
    const end = startOfUtcDay(r.endDate < to ? r.endDate : to).getTime();
    for (let d = startOfUtcDay(start); d.getTime() <= end; d = addDays(d, 1)) {
      if (isWorkingDay(d)) set.add(isoDate(d));
    }
    days.set(r.personId, set);
  }
  const result = new Map<string, Map<string, number>>();
  for (const [person, set] of days) {
    const weeks = new Map<string, number>();
    for (const day of set) {
      const week = isoDate(weekStartOf(new Date(`${day}T00:00:00Z`)));
      weeks.set(week, (weeks.get(week) ?? 0) + 1);
    }
    result.set(person, weeks);
  }
  return result;
}
