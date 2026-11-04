import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

// Task history (M4 JIRA-lite): kept in the audit log, shown newest first with names.
const app = createApp();
const CODE = `HI${Date.now().toString(36).slice(-5).toUpperCase()}`;
const EMAIL = `history.member.${CODE.toLowerCase()}@resourceboard.local`;
let admin: string;
let outsider: string;
let projectId: string;
let taskId: string;

const as = (token: string) => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(token, { type: 'bearer' }).send(body),
});
type Entry = {
  action: string;
  actor: { name: string } | null;
  changes: { field: string; from: unknown; to: unknown }[];
  hours: number | null;
};
const history = async () => (await as(admin).get(`/api/tasks/${taskId}/history`)).body as Entry[];

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  admin = login.body.token;
  projectId = (await as(admin).post('/api/projects', { code: CODE, name: `History ${CODE}` })).body
    .id;
  const person = await prisma.person.create({
    data: { name: 'History Outsider', email: EMAIL, role: 'MEMBER' },
  });
  outsider = signToken({ id: person.id, email: person.email, role: 'MEMBER' });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: 'Task', entityId: taskId } });
  await prisma.project.deleteMany({ where: { code: CODE } });
  await prisma.person.deleteMany({ where: { email: EMAIL } });
});

describe('task history', () => {
  it('records the creation', async () => {
    taskId = (await as(admin).post('/api/tasks', { projectId, title: 'Draft', estimateHours: 4 }))
      .body.id;
    const [created] = await history();
    expect(created.action).toBe('create');
    expect(created.actor?.name).toBeTruthy();
  });

  it('records only the fields that changed, with readable values', async () => {
    const sprint = (await as(admin).post('/api/sprints', { projectId, name: 'Sprint H' })).body;
    await as(admin).patch(`/api/tasks/${taskId}`, {
      title: 'Final',
      priority: 'HIGH',
      estimateHours: 4, // unchanged
      sprintId: sprint.id,
      dueDate: '2026-11-20',
      labels: ['ui'],
    });
    const [latest] = await history();
    expect(latest.action).toBe('update');
    expect(Object.fromEntries(latest.changes.map((c) => [c.field, [c.from, c.to]]))).toEqual({
      title: ['Draft', 'Final'],
      priority: ['MEDIUM', 'HIGH'],
      sprint: [null, 'Sprint H'],
      dueDate: [null, '2026-11-20'],
      labels: [[], ['ui']],
    });
  });

  it('skips saves that change nothing, and board reordering', async () => {
    const before = (await history()).length;
    await as(admin).patch(`/api/tasks/${taskId}`, { title: 'Final' });
    await request(app)
      .patch(`/api/tasks/${taskId}/move`)
      .auth(admin, { type: 'bearer' })
      .send({ status: 'TODO', order: 5 });
    expect((await history()).length).toBe(before);
  });

  it('records a board move to another column, and logged hours', async () => {
    await request(app)
      .patch(`/api/tasks/${taskId}/move`)
      .auth(admin, { type: 'bearer' })
      .send({ status: 'IN_PROGRESS', afterId: null, beforeId: null });
    await as(admin).post(`/api/tasks/${taskId}/worklogs`, { hours: 1.5 });
    const [worklog, move] = await history();
    expect(worklog).toMatchObject({ action: 'worklog', hours: 1.5 });
    expect(move.changes).toEqual([{ field: 'status', from: 'TODO', to: 'IN_PROGRESS' }]);
  });

  it('hides the history of tasks a team member cannot see', async () => {
    expect((await as(outsider).get(`/api/tasks/${taskId}/history`)).status).toBe(404);
  });
});
