import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TaskStatus } from '../src/generated/prisma/enums.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

// Sprint burndown (M4 JIRA-lite), rebuilt from the task history with completedAt and current
// sprint membership as fallbacks. A small sprint: four days ago until three days from now.
const app = createApp();
const CODE = `BD${Date.now().toString(36).slice(-5).toUpperCase()}`;
const EMAIL = `burndown.outsider.${CODE.toLowerCase()}@resourceboard.local`;
const DAY = 86_400_000;
const T = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime(); // today, UTC
const day = (offset: number, hour = 0) => new Date(T + offset * DAY + hour * 3_600_000);
const iso = (offset: number) => day(offset).toISOString().slice(0, 10);

let admin: string;
let outsider: string;
let projectId: string;
let sprintId: string;
let adminId: string;
const taskIds: string[] = [];

const get = (token: string, url: string) => request(app).get(url).auth(token, { type: 'bearer' });

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  admin = login.body.token;
  adminId = login.body.user.id;
  projectId = (
    await request(app)
      .post('/api/projects')
      .auth(admin, { type: 'bearer' })
      .send({ code: CODE, name: `Burndown ${CODE}` })
  ).body.id;
  sprintId = (
    await prisma.sprint.create({
      data: {
        projectId,
        name: 'Sprint B',
        status: 'ACTIVE',
        startDate: day(-4),
        endDate: day(3),
      },
    })
  ).id;

  // Tasks made directly (no recorded creation, like older tasks), with history entries dated
  // in the past.
  let number = 0;
  const task = async (
    hours: number,
    status: TaskStatus,
    inSprint: boolean,
    extra: { completedAt?: Date } = {},
  ) => {
    const t = await prisma.task.create({
      data: {
        projectId,
        number: ++number,
        title: `Task ${number}`,
        status,
        estimateHours: hours,
        sprintId: inSprint ? sprintId : null,
        ...extra,
      },
    });
    taskIds.push(t.id);
    return t.id;
  };
  const change = (taskId: string, at: Date, before: object, after: object) =>
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'task.update',
        entityType: 'Task',
        entityId: taskId,
        before,
        after,
        createdAt: at,
      },
    });

  // A: done three days ago (no history: completedAt).
  await task(8, 'DONE', true, { completedAt: day(-3, 10) });
  // B: moved to Done yesterday.
  const b = await task(5, 'DONE', true, { completedAt: day(-1, 12) });
  await change(b, day(-1, 12), { status: 'IN_PROGRESS' }, { status: 'DONE' });
  // C: open all along.
  await task(3, 'TODO', true);
  // D: taken out of the sprint two days ago.
  const d = await task(4, 'TODO', false);
  await change(d, day(-2, 12), { sprintId }, { sprintId: null });
  // E: added to the sprint two days ago.
  const e = await task(2, 'TODO', true);
  await change(e, day(-2, 12), { sprintId: null }, { sprintId });
  // F: done three days ago, reopened two days ago.
  const f = await task(1, 'TODO', true);
  await change(f, day(-3, 12), { status: 'TODO' }, { status: 'DONE' });
  await change(f, day(-2, 12), { status: 'DONE' }, { status: 'TODO' });
  await prisma.project.update({ where: { id: projectId }, data: { lastTaskNumber: number } });
  // G: created today through the API: counts from today only.
  const g = await request(app)
    .post('/api/tasks')
    .auth(admin, { type: 'bearer' })
    .send({ projectId, title: 'Task G', estimateHours: 10, sprintId });
  taskIds.push(g.body.id);

  const person = await prisma.person.create({
    data: { name: 'Burndown Outsider', email: EMAIL, role: 'MEMBER' },
  });
  outsider = signToken({ id: person.id, email: person.email, role: 'MEMBER' });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: 'Task', entityId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { code: CODE } });
  await prisma.person.deleteMany({ where: { email: EMAIL } });
});

describe('sprint burndown', () => {
  it('rebuilds the remaining work per day from history, completedAt and membership', async () => {
    const res = await get(admin, `/api/sprints/${sprintId}/burndown`);
    expect(res.status).toBe(200);
    // Scope today: A 8 + B 5 + C 3 + E 2 + F 1 + G 10 (D left the sprint).
    expect(res.body.totalHours).toBe(29);
    expect(res.body.totalTasks).toBe(6);
    const rows = res.body.days.map(
      (d: { date: string; remainingHours: number | null; remainingTasks: number | null }) => [
        d.date,
        d.remainingHours,
        d.remainingTasks,
      ],
    );
    expect(rows).toEqual([
      [iso(-4), 21, 5], // A, B, C, D, F open; E not in yet
      [iso(-3), 12, 3], // A and F done
      [iso(-2), 11, 4], // D out, E in, F reopened
      [iso(-1), 6, 3], // B done
      [iso(0), 16, 4], // G created today
      [iso(1), null, null],
      [iso(2), null, null],
      [iso(3), null, null],
    ]);
  });

  it('draws the ideal line from the full scope to zero on the last day', async () => {
    const { days } = (await get(admin, `/api/sprints/${sprintId}/burndown`)).body;
    expect(days[0]).toMatchObject({ idealHours: 29, idealTasks: 6 });
    expect(days[7]).toMatchObject({ idealHours: 0, idealTasks: 0 });
    expect(days[3].idealHours).toBeCloseTo(29 * (1 - 3 / 7), 2);
  });

  it('still counts unfinished tasks after the sprint is completed', async () => {
    await request(app)
      .patch(`/api/sprints/${sprintId}`)
      .auth(admin, { type: 'bearer' })
      .send({ status: 'CLOSED' });
    expect(await prisma.task.count({ where: { sprintId } })).toBe(2); // A and B, done
    const { days } = (await get(admin, `/api/sprints/${sprintId}/burndown`)).body;
    expect(days[4]).toMatchObject({ remainingHours: 16, remainingTasks: 4 });
  });

  it('needs dates, and keeps team members to their own projects', async () => {
    expect((await get(outsider, `/api/sprints/${sprintId}/burndown`)).status).toBe(404);
    expect((await get(admin, `/api/sprints/nope/burndown`)).status).toBe(404);
    const undated = await prisma.sprint.create({ data: { projectId, name: 'No dates' } });
    expect((await get(admin, `/api/sprints/${undated.id}/burndown`)).status).toBe(400);
  });
});
