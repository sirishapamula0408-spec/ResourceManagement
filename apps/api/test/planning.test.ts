import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

// Sprints and epics (M2): managed per project, assigned to tasks, shown on the board and list.
const app = createApp();
const suffix = Date.now().toString(36).slice(-5).toUpperCase();
const CODES = [`SP${suffix}`, `SQ${suffix}`];
const MEMBER_EMAIL = `planning.member.${suffix.toLowerCase()}@resourceboard.local`;
let admin: string;
let member: string;
const projectIds: string[] = [];

const as = (token: string) => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(token, { type: 'bearer' }).send(body),
  del: (url: string) => request(app).delete(url).auth(token, { type: 'bearer' }),
});

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  admin = login.body.token;
  for (const code of CODES) {
    const res = await as(admin).post('/api/projects', { code, name: `Planning test ${code}` });
    expect(res.status).toBe(201);
    projectIds.push(res.body.id);
  }
  // A team member staffed on the first project only.
  const person = await prisma.person.create({
    data: { name: 'Planning Member', email: MEMBER_EMAIL, role: 'MEMBER' },
  });
  await prisma.projectMember.create({ data: { projectId: projectIds[0], personId: person.id } });
  member = signToken({ id: person.id, email: person.email, role: 'MEMBER' });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { code: { in: CODES } } });
  await prisma.person.deleteMany({ where: { email: MEMBER_EMAIL } });
});

describe('sprints and epics', () => {
  let sprintId: string;
  let nextSprintId: string;
  let epicId: string;
  let openTaskId: string;
  let doneTaskId: string;

  it('lets an admin create sprints and epics on a project', async () => {
    const [p] = projectIds;
    const sprint = await as(admin).post('/api/sprints', {
      projectId: p,
      name: 'Sprint 1',
      goal: 'Ship the board',
      startDate: '2026-11-02',
      endDate: '2026-11-13',
    });
    expect(sprint.status).toBe(201);
    expect(sprint.body.status).toBe('PLANNED');
    sprintId = sprint.body.id;
    nextSprintId = (await as(admin).post('/api/sprints', { projectId: p, name: 'Sprint 2' })).body
      .id;
    const epic = await as(admin).post('/api/epics', {
      projectId: p,
      name: 'Reporting',
      color: '#2f7d6d',
    });
    expect(epic.status).toBe(201);
    epicId = epic.body.id;
  });

  it('checks dates and colours', async () => {
    const [p] = projectIds;
    const bad = await as(admin).post('/api/sprints', {
      projectId: p,
      name: 'Backwards',
      startDate: '2026-11-13',
      endDate: '2026-11-02',
    });
    expect(bad.status).toBe(400);
    expect(
      (await as(admin).post('/api/epics', { projectId: p, name: 'X', color: 'red' })).status,
    ).toBe(400);
  });

  it('puts tasks in a sprint and an epic, and filters by them', async () => {
    const [p] = projectIds;
    const open = await as(admin).post('/api/tasks', {
      projectId: p,
      title: 'Open task',
      sprintId,
      epicId,
    });
    expect(open.status).toBe(201);
    openTaskId = open.body.id;
    const done = await as(admin).post('/api/tasks', {
      projectId: p,
      title: 'Done task',
      status: 'DONE',
      sprintId,
    });
    doneTaskId = done.body.id;

    const inSprint = await as(admin).get(`/api/tasks?sprintId=${sprintId}`);
    expect(inSprint.body.map((t: { title: string }) => t.title).sort()).toEqual([
      'Done task',
      'Open task',
    ]);
    const inEpic = await as(admin).get(`/api/tasks?epicId=${epicId}`);
    expect(inEpic.body).toHaveLength(1);
    expect(inEpic.body[0].sprint).toMatchObject({ name: 'Sprint 1', status: 'PLANNED' });
    expect(inEpic.body[0].epic).toMatchObject({ name: 'Reporting', color: '#2f7d6d' });

    const sprints = await as(admin).get(`/api/sprints?projectId=${p}`);
    expect(sprints.body.find((s: { id: string }) => s.id === sprintId)).toMatchObject({
      tasks: 2,
      done: 1,
    });
  });

  it('refuses a sprint or epic from another project', async () => {
    const res = await as(admin).post('/api/tasks', {
      projectId: projectIds[1],
      title: 'Wrong sprint',
      sprintId,
    });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.sprintId).toBeDefined();
  });

  it('drops the sprint and epic when a task moves to another project', async () => {
    const task = await as(admin).post('/api/tasks', {
      projectId: projectIds[0],
      title: 'Moving task',
      sprintId,
      epicId,
    });
    const moved = await as(admin).patch(`/api/tasks/${task.body.id}`, {
      projectId: projectIds[1],
    });
    expect(moved.status).toBe(200);
    expect(moved.body.sprintId).toBeNull();
    expect(moved.body.epicId).toBeNull();
  });

  it('runs one sprint at a time', async () => {
    expect((await as(admin).patch(`/api/sprints/${sprintId}`, { status: 'ACTIVE' })).status).toBe(
      200,
    );
    const second = await as(admin).patch(`/api/sprints/${nextSprintId}`, { status: 'ACTIVE' });
    expect(second.status).toBe(409);
  });

  it('takes unfinished tasks out of a sprint when it is completed', async () => {
    expect((await as(admin).patch(`/api/sprints/${sprintId}`, { status: 'CLOSED' })).status).toBe(
      200,
    );
    const open = await prisma.task.findUniqueOrThrow({ where: { id: openTaskId } });
    const done = await prisma.task.findUniqueOrThrow({ where: { id: doneTaskId } });
    expect(open.sprintId).toBeNull();
    expect(done.sprintId).toBe(sprintId);
    // A completed sprint takes no new tasks.
    const res = await as(admin).patch(`/api/tasks/${openTaskId}`, { sprintId });
    expect(res.status).toBe(400);
  });

  it('shows a team member their projects’ sprints but does not let them change them', async () => {
    const all = await as(member).get('/api/sprints');
    expect(all.status).toBe(200);
    expect(new Set(all.body.map((s: { projectId: string }) => s.projectId))).toEqual(
      new Set([projectIds[0]]),
    );
    const other = await as(member).get(`/api/sprints?projectId=${projectIds[1]}`);
    expect(other.body).toEqual([]);
    expect(
      (await as(member).post('/api/sprints', { projectId: projectIds[0], name: 'No' })).status,
    ).toBe(403);
    expect((await as(member).patch(`/api/epics/${epicId}`, { name: 'No' })).status).toBe(403);
  });

  it('keeps tasks when a sprint or epic is deleted', async () => {
    expect((await as(admin).del(`/api/epics/${epicId}`)).status).toBe(204);
    expect((await as(admin).del(`/api/sprints/${sprintId}`)).status).toBe(204);
    const done = await prisma.task.findUniqueOrThrow({ where: { id: doneTaskId } });
    expect(done.sprintId).toBeNull();
  });
});
