import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Team members create tasks on projects they're staffed on, assign them to anyone on the
// project, and edit the tasks they created; delivery heads and resource managers still only view.
const app = createApp();
const TAG = Date.now().toString(36);
const CODE = `MT${TAG.slice(-5).toUpperCase()}`;
const OTHER = `MO${TAG.slice(-5).toUpperCase()}`;
let admin: string;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

const as = (who: string) => {
  const t = () => (who === 'admin' ? admin : tokens[who]);
  return {
    post: (url: string, body: object = {}) =>
      request(app).post(url).auth(t(), { type: 'bearer' }).send(body),
    patch: (url: string, body: object) =>
      request(app).patch(url).auth(t(), { type: 'bearer' }).send(body),
    delete: (url: string) => request(app).delete(url).auth(t(), { type: 'bearer' }),
  };
};

beforeAll(async () => {
  admin = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' })
  ).body.token;
  for (const [name, role] of [
    ['mia', 'MEMBER'],
    ['noah', 'MEMBER'],
    ['vic', 'VIEWER'],
    ['rita', 'RESOURCE_MANAGER'],
  ] as const) {
    const email = `mt-${name}-${TAG}@example.test`;
    ids[name] = (
      await as('admin').post('/api/people', {
        name: `MT ${name} ${TAG}`,
        email,
        role,
        password: 'Start1234',
      })
    ).body.id;
    await prisma.person.update({ where: { id: ids[name] }, data: { mustChangePassword: false } });
    tokens[name] = (
      await request(app).post('/api/auth/login').send({ email, password: 'Start1234' })
    ).body.token;
  }
  ids.project = (
    await as('admin').post('/api/projects', { code: CODE, name: `MT ${CODE}` })
  ).body.id;
  ids.other = (
    await as('admin').post('/api/projects', { code: OTHER, name: `MT ${OTHER}` })
  ).body.id;
  await request(app)
    .put(`/api/projects/${ids.project}/members`)
    .auth(admin, { type: 'bearer' })
    .send({ personIds: [ids.mia, ids.noah, ids.vic, ids.rita] });
}, 30_000); // four sign-ins (bcrypt) are slow when every test file runs at once

// By this run's codes and emails, so a setup cut short still cleans up what it made.
afterAll(async () => {
  const projects = { code: { in: [CODE, OTHER] } };
  await prisma.task.deleteMany({ where: { project: projects } });
  await prisma.project.deleteMany({ where: projects });
  await prisma.person.deleteMany({
    where: { email: { startsWith: 'mt-', endsWith: `-${TAG}@example.test` } },
  });
});

describe('team members and tasks', () => {
  let mine: string;
  let pmTask: string;

  it('a member creates a task on their project, assigned to a teammate', async () => {
    const res = await as('mia').post('/api/tasks', {
      projectId: ids.project,
      title: 'Fix the export',
      assigneeId: ids.noah,
      priority: 'HIGH',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ assigneeId: ids.noah, createdById: ids.mia });
    mine = res.body.id;
  });

  it('but not on a project they are not staffed on, nor for a viewer or outsider', async () => {
    expect(
      (await as('mia').post('/api/tasks', { projectId: ids.other, title: 'Elsewhere' })).status,
    ).toBe(403);
    const viewer = await as('mia').post('/api/tasks', {
      projectId: ids.project,
      title: 'For a viewer',
      assigneeId: ids.vic,
    });
    expect(viewer.status).toBe(400);
  });

  it('viewers and resource managers still cannot create tasks', async () => {
    expect(
      (await as('vic').post('/api/tasks', { projectId: ids.project, title: 'x' })).status,
    ).toBe(403);
    expect(
      (await as('rita').post('/api/tasks', { projectId: ids.project, title: 'x' })).status,
    ).toBe(403);
  });

  it('the creator edits every field of their task; a teammate does not', async () => {
    const res = await as('mia').patch(`/api/tasks/${mine}`, {
      title: 'Fix the CSV export',
      estimateHours: 3,
      assigneeId: ids.mia,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Fix the CSV export', assigneeId: ids.mia });
    expect((await as('noah').patch(`/api/tasks/${mine}`, { title: 'Mine now' })).status).toBe(403);
  });

  it('the creator moves it, logs hours and links it, even when assigned to someone else', async () => {
    await as('mia').patch(`/api/tasks/${mine}`, { assigneeId: ids.noah });
    expect(
      (await as('mia').patch(`/api/tasks/${mine}/move`, { status: 'IN_PROGRESS' })).status,
    ).toBe(200);
    expect(
      (await as('mia').post(`/api/tasks/${mine}/worklogs`, { hours: 1, date: '2026-11-10' }))
        .status,
    ).toBe(201);
  });

  it('a member still only changes the status of a PM’s task assigned to them', async () => {
    pmTask = (
      await as('admin').post('/api/tasks', {
        projectId: ids.project,
        title: 'Planned by the PM',
        assigneeId: ids.mia,
      })
    ).body.id;
    expect((await as('mia').patch(`/api/tasks/${pmTask}`, { status: 'IN_PROGRESS' })).status).toBe(
      200,
    );
    expect((await as('mia').patch(`/api/tasks/${pmTask}`, { title: 'Renamed' })).status).toBe(403);
  });

  it('only admins and PMs delete tasks, even the creator’s own', async () => {
    expect((await as('mia').delete(`/api/tasks/${mine}`)).status).toBe(403);
    expect((await as('admin').delete(`/api/tasks/${mine}`)).status).toBe(204);
  });

  it('cannot move their task to a project they are not on', async () => {
    const t = (await as('mia').post('/api/tasks', { projectId: ids.project, title: 'Stay' })).body
      .id;
    expect((await as('mia').patch(`/api/tasks/${t}`, { projectId: ids.other })).status).toBe(403);
  });
});
