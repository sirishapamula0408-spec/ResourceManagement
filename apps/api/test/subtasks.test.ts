import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Sub-tasks (M4 JIRA-lite): one level deep, on the parent's project.
const app = createApp();
const suffix = Date.now().toString(36).slice(-5).toUpperCase();
const CODES = [`ST${suffix}`, `SU${suffix}`];
let token: string;
const projectIds: string[] = [];

const as = () => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(token, { type: 'bearer' }).send(body),
  del: (url: string) => request(app).delete(url).auth(token, { type: 'bearer' }),
});
const create = (title: string, extra: object = {}, project = 0) =>
  as().post('/api/tasks', { projectId: projectIds[project], title, ...extra });

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  token = login.body.token;
  for (const code of CODES) {
    projectIds.push((await as().post('/api/projects', { code, name: `Subtasks ${code}` })).body.id);
  }
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { code: { in: CODES } } });
});

describe('sub-tasks', () => {
  let parentId: string;
  let childId: string;

  it('creates a sub-task and shows the link both ways on the task list', async () => {
    parentId = (await create('Parent story')).body.id;
    const child = await create('Child task', { parentId });
    expect(child.status).toBe(201);
    childId = child.body.id;

    const list = await as().get(`/api/tasks?projectId=${projectIds[0]}`);
    const parent = list.body.find((t: { id: string }) => t.id === parentId);
    const sub = list.body.find((t: { id: string }) => t.id === childId);
    expect(parent.subtaskCount).toBe(1);
    expect(sub.parent).toEqual({ id: parentId, key: `${CODES[0]}-1`, title: 'Parent story' });
  });

  it('keeps sub-tasks one level deep and on the same project', async () => {
    expect((await create('Grandchild', { parentId: childId })).status).toBe(400);
    expect((await create('Elsewhere', { parentId }, 1)).status).toBe(400);
    expect((await as().patch(`/api/tasks/${parentId}`, { parentId })).status).toBe(400);
    // A task with sub-tasks cannot become a sub-task.
    const other = (await create('Other story')).body.id;
    const res = await as().patch(`/api/tasks/${parentId}`, { parentId: other });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.parentId).toBeDefined();
  });

  it('will not move a parent away from its sub-tasks; a moved sub-task leaves its parent', async () => {
    expect((await as().patch(`/api/tasks/${parentId}`, { projectId: projectIds[1] })).status).toBe(
      400,
    );
    const moved = await as().patch(`/api/tasks/${childId}`, { projectId: projectIds[1] });
    expect(moved.status).toBe(200);
    expect(moved.body.parentId).toBeNull();
  });

  it('detaches and keeps sub-tasks when the parent is deleted', async () => {
    const child = (await create('Another child', { parentId })).body.id;
    expect((await as().del(`/api/tasks/${parentId}`)).status).toBe(204);
    const kept = await prisma.task.findUniqueOrThrow({ where: { id: child } });
    expect(kept.parentId).toBeNull();
  });
});
