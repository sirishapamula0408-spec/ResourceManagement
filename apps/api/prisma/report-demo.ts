/**
 * Report demo data: three projects with ~12 weeks of history, for checking the weekly and
 * monthly status reports. ADDS data only; nothing that already exists is changed.
 *
 *   npm run db:demo:reports            add (or re-create) the demo projects
 *   npm run db:demo:reports -- --remove   delete them again
 *
 * Projects are prefixed DEMO- and each is built to land on one health rating:
 *   DEMO-GRN  on track   steady delivery, nothing blocked or overdue, hours under estimate
 *   DEMO-AMB  at risk    one blocked task, two overdue
 *   DEMO-RED  off track  a blocked critical task, four overdue, hours over the estimate
 * Dates are relative to today, so the history always ends this week.
 */
import { prisma } from '../src/lib/prisma.js';
import { addDays, weekStartOf } from '../src/modules/dashboard/utilization.js';
import type { TaskPriority, TaskStatus } from '../src/generated/prisma/enums.js';

const PREFIX = 'DEMO-';

// [title, start week (relative to this week), working days, estimate h, status, priority, days late]
type Spec = [string, number | null, number, number, TaskStatus, TaskPriority, number?];

const PROJECTS: {
  code: string;
  name: string;
  client: string;
  billable: boolean;
  /** Hours logged per hour of estimate: under 1 stays within budget, over 1 overruns. */
  effort: number;
  tasks: Spec[];
}[] = [
  {
    code: 'DEMO-GRN',
    name: 'Demo · Customer onboarding revamp',
    client: 'Demo Client A',
    billable: true,
    effort: 0.85,
    tasks: [
      ['Discovery workshops', -12, 5, 24, 'DONE', 'HIGH'],
      ['Journey mapping', -11, 5, 20, 'DONE', 'MEDIUM'],
      ['Wireframes', -10, 10, 40, 'DONE', 'HIGH'],
      ['Design system tokens', -8, 5, 16, 'DONE', 'MEDIUM'],
      ['Sign-up flow build', -7, 10, 48, 'DONE', 'HIGH'],
      ['KYC document upload', -5, 10, 40, 'DONE', 'HIGH', 1],
      ['Email verification', -3, 5, 16, 'DONE', 'MEDIUM'],
      ['Profile settings', -1, 5, 16, 'DONE', 'MEDIUM'],
      ['Terms and consent screen', 0, 3, 8, 'DONE', 'LOW'],
      ['Welcome tour', -1, 10, 32, 'IN_REVIEW', 'MEDIUM'],
      ['Analytics events', 0, 10, 24, 'IN_PROGRESS', 'LOW'],
      ['Accessibility review', 1, 5, 12, 'TODO', 'MEDIUM'],
      ['Launch checklist', 2, 5, 8, 'TODO', 'LOW'],
      ['Referral programme', null, 0, 20, 'BACKLOG', 'LOW'],
    ],
  },
  {
    code: 'DEMO-AMB',
    name: 'Demo · Data warehouse migration',
    client: 'Internal',
    billable: false,
    effort: 0.95,
    tasks: [
      ['Source system inventory', -10, 5, 16, 'DONE', 'MEDIUM'],
      ['Schema mapping', -9, 10, 40, 'DONE', 'HIGH'],
      ['Ingest finance tables', -7, 10, 48, 'DONE', 'HIGH'],
      ['Ingest HR tables', -5, 10, 40, 'DONE', 'MEDIUM', 2],
      ['Data quality rules', -1, 5, 16, 'DONE', 'MEDIUM'],
      ['Reconciliation reports', -3, 10, 36, 'IN_PROGRESS', 'HIGH'],
      ['Access controls', -2, 5, 16, 'BLOCKED', 'HIGH'],
      ['Performance tuning', 0, 10, 30, 'IN_PROGRESS', 'MEDIUM'],
      ['Cut-over rehearsal', 2, 5, 20, 'TODO', 'HIGH'],
      ['Decommission old ETL', 4, 5, 12, 'TODO', 'LOW'],
    ],
  },
  {
    code: 'DEMO-RED',
    name: 'Demo · Mobile banking app',
    client: 'Demo Client B',
    billable: true,
    effort: 1.35,
    tasks: [
      ['Requirements sign-off', -12, 5, 20, 'DONE', 'HIGH'],
      ['Solution architecture', -11, 5, 24, 'DONE', 'HIGH', 3],
      ['Login and MFA', -10, 10, 60, 'DONE', 'CRITICAL', 4],
      ['Accounts overview', -8, 10, 56, 'DONE', 'HIGH', 5],
      ['Transaction history', 0, 2, 12, 'DONE', 'MEDIUM'],
      ['Payments and transfers', -6, 10, 64, 'IN_PROGRESS', 'CRITICAL'],
      ['Card controls', -5, 10, 48, 'IN_PROGRESS', 'HIGH'],
      ['Push notifications', -4, 5, 24, 'TODO', 'MEDIUM'],
      ['App store submission', -1, 5, 16, 'BLOCKED', 'CRITICAL'],
      ['Security penetration test', 1, 5, 24, 'TODO', 'HIGH'],
    ],
  },
];

const isWorkingDay = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

/** Due date of a task starting on a Monday and running `days` working days. */
const dueAfter = (start: Date, days: number) =>
  addDays(start, Math.floor((days - 1) / 5) * 7 + ((days - 1) % 5));

/** Working days from `from` to `to`, both included. */
function workingDays(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) out.push(d);
  return out;
}

async function remove() {
  const { count } = await prisma.project.deleteMany({ where: { code: { startsWith: PREFIX } } });
  console.log(`Removed ${count} demo project(s) with their tasks, hours and members.`);
}

async function add() {
  await remove(); // re-running gives a clean, up-to-date copy

  const people = await prisma.person.findMany({
    where: { active: true, role: 'MEMBER' },
    orderBy: { name: 'asc' },
    take: 6,
  });
  if (people.length < 2) throw new Error('Need at least two active team members to assign work.');
  const owner =
    (await prisma.person.findFirst({
      where: { active: true, role: 'PM' },
      orderBy: { name: 'asc' },
    })) ?? (await prisma.person.findFirst({ where: { active: true, role: 'ADMIN' } }));

  const today = new Date();
  const todayDay = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const thisWeek = weekStartOf(today);
  let taskCount = 0;
  let logCount = 0;

  for (const [pi, spec] of PROJECTS.entries()) {
    // Each project gets four people, rotating through the team so workloads overlap.
    const team = [0, 1, 2, 3].map((i) => people[(pi * 2 + i) % people.length]);
    const project = await prisma.project.create({
      data: {
        code: spec.code,
        name: spec.name,
        client: spec.client,
        billable: spec.billable,
        status: 'ACTIVE',
        startDate: addDays(thisWeek, -12 * 7),
        endDate: addDays(thisWeek, 6 * 7),
        ownerId: owner?.id,
        description: 'Demo data for checking weekly and monthly status reports.',
        members: {
          create: [...new Set([...team.map((p) => p.id), ...(owner ? [owner.id] : [])])].map(
            (personId) => ({ personId }),
          ),
        },
      },
    });

    for (const [
      ti,
      [title, startWeek, days, estimate, status, priority, late = 0],
    ] of spec.tasks.entries()) {
      const assignee = team[ti % team.length];
      const startDate = startWeek === null ? null : addDays(thisWeek, startWeek * 7);
      const dueDate = startDate && dueAfter(startDate, days);
      const completedAt = status === 'DONE' && dueDate ? addDays(dueDate, late) : null;
      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          title,
          status,
          priority,
          assigneeId: assignee.id,
          estimateHours: estimate,
          startDate,
          dueDate,
          completedAt,
          order: (ti + 1) * 1000,
        },
      });
      taskCount++;

      // Daily hours from the start until it was finished (or today), at the project's effort.
      if (!startDate || !dueDate || status === 'TODO' || status === 'BACKLOG') continue;
      const lastDay = completedAt ?? dueDate;
      const logDays = workingDays(startDate, lastDay < todayDay ? lastDay : todayDay);
      if (!logDays.length) continue;
      const planned = workingDays(startDate, completedAt ?? dueDate).length || 1;
      const perDay = Math.max(0.5, Math.round(((estimate * spec.effort) / planned) * 2) / 2);
      await prisma.worklog.createMany({
        data: logDays.map((date) => ({
          taskId: task.id,
          personId: assignee.id,
          date,
          hours: perDay,
          note: 'Demo',
        })),
      });
      logCount += logDays.length;
    }
  }

  console.log(
    `Added ${PROJECTS.length} demo projects (${PROJECTS.map((p) => p.code).join(', ')}), ` +
      `${taskCount} tasks and ${logCount} days of logged hours, assigned to: ` +
      `${people.map((p) => p.name).join(', ')}.`,
  );
  console.log('Remove them again with: npm run db:demo:reports -- --remove');
}

(process.argv.includes('--remove') ? remove() : add())
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
