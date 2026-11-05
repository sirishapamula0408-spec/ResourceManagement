import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { type AuthUser, signToken } from '../src/middleware/auth.js';
import { loopbackApi } from '../src/modules/mcp/tools.js';
import * as attachments from '../src/modules/tasks/attachments.service.js';
import * as comments from '../src/modules/tasks/comments.service.js';
import * as links from '../src/modules/tasks/links.service.js';
import * as tasks from '../src/modules/tasks/tasks.service.js';

// The read-only VIEWER role: a member's read scope (own projects and their tasks), no writes.
const app = createApp();
const suffix = Date.now().toString(36).slice(-5).toUpperCase();
const [MINE, OTHER] = [`VW${suffix}`, `VX${suffix}`];
const VIEWER_EMAIL = `viewer.${suffix.toLowerCase()}@resourceboard.local`;
const MEMBER_EMAIL = `viewer.member.${suffix.toLowerCase()}@resourceboard.local`;

let admin: string;
let viewer: string;
let viewerUser: AuthUser;
let memberId: string;
const ids: Record<string, string> = {};

const as = (token: string) => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object = {}) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object = {}) =>
    request(app).patch(url).auth(token, { type: 'bearer' }).send(body),
  put: (url: string, body: object = {}) =>
    request(app).put(url).auth(token, { type: 'bearer' }).send(body),
  del: (url: string) => request(app).delete(url).auth(token, { type: 'bearer' }),
});

beforeAll(async () => {
  admin = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' })
  ).body.token;
  ids.mine = (
    await as(admin).post('/api/projects', { code: MINE, name: `Viewer ${MINE}` })
  ).body.id;
  ids.other = (
    await as(admin).post('/api/projects', { code: OTHER, name: `Viewer ${OTHER}` })
  ).body.id;

  const person = await prisma.person.create({
    data: { name: 'Viewer Test', email: VIEWER_EMAIL, role: 'VIEWER' },
  });
  const member = await prisma.person.create({
    data: { name: 'Viewer Test Member', email: MEMBER_EMAIL, role: 'MEMBER' },
  });
  memberId = member.id;
  await prisma.projectMember.createMany({
    data: [
      { projectId: ids.mine, personId: person.id },
      { projectId: ids.mine, personId: member.id },
    ],
  });
  viewerUser = { id: person.id, email: person.email, role: 'VIEWER' };
  viewer = signToken(viewerUser);

  for (const [name, project] of [
    ['task', 'mine'],
    ['task2', 'mine'],
    ['hidden', 'other'],
  ] as const) {
    ids[name] = (
      await as(admin).post('/api/tasks', { projectId: ids[project], title: `Viewer ${name}` })
    ).body.id;
  }
  ids.comment = (
    await as(admin).post(`/api/tasks/${ids.task}/comments`, { body: 'Admin note' })
  ).body.id;
  ids.link = (
    await as(admin).post(`/api/tasks/${ids.task}/links`, {
      kind: 'RELATES',
      targetKey: `${MINE}-2`,
    })
  ).body.id;
  ids.attachment = (
    await request(app)
      .post(`/api/tasks/${ids.task}/attachments`)
      .query({ name: 'notes.txt' })
      .auth(admin, { type: 'bearer' })
      .set('Content-Type', 'text/plain')
      .send('hello')
  ).body.id;
  ids.sprint = (
    await as(admin).post('/api/sprints', {
      projectId: ids.mine,
      name: 'Sprint 1',
      startDate: '2026-11-02',
      endDate: '2026-11-13',
    })
  ).body.id;
  ids.epic = (await as(admin).post('/api/epics', { projectId: ids.mine, name: 'Epic 1' })).body.id;
});

afterAll(async () => {
  await as(admin).del(`/api/attachments/${ids.attachment}`);
  await prisma.project.deleteMany({ where: { code: { in: [MINE, OTHER] } } });
  await prisma.savedFilter.deleteMany({ where: { person: { email: VIEWER_EMAIL } } });
  await prisma.notification.deleteMany({
    where: { recipient: { email: { in: [VIEWER_EMAIL, MEMBER_EMAIL] } } },
  });
  await prisma.person.deleteMany({ where: { email: { in: [VIEWER_EMAIL, MEMBER_EMAIL] } } });
});

describe('viewer: reads', () => {
  it('sees only their own projects and those projects’ tasks', async () => {
    const projects = await as(viewer).get('/api/projects');
    expect(projects.status).toBe(200);
    const codes = projects.body.map((p: { code: string }) => p.code);
    expect(codes).toContain(MINE);
    expect(codes).not.toContain(OTHER);

    const all = await as(viewer).get('/api/tasks');
    expect(all.status).toBe(200);
    const projectIds = new Set(all.body.map((t: { projectId: string }) => t.projectId));
    expect([...projectIds]).toEqual([ids.mine]);
    expect((await as(viewer).get(`/api/tasks?projectId=${ids.other}`)).body).toEqual([]);
    expect((await as(viewer).get(`/api/tasks/${ids.hidden}/comments`)).status).toBe(404);
  });

  it('opens comments, links, history, attachments, sprints and epics', async () => {
    const t = `/api/tasks/${ids.task}`;
    for (const url of [
      `${t}/comments`,
      `${t}/links`,
      `${t}/history`,
      `${t}/attachments`,
      `/api/sprints?projectId=${ids.mine}`,
      `/api/sprints/${ids.sprint}/burndown`,
      `/api/epics?projectId=${ids.mine}`,
      '/api/tasks/labels',
      '/api/people',
      '/api/notifications',
      '/api/filters',
      '/api/auth/me',
    ]) {
      expect([url, (await as(viewer).get(url)).status]).toEqual([url, 200]);
    }
    const file = await as(viewer).get(`/api/attachments/${ids.attachment}`);
    expect(file.status).toBe(200);
    expect(file.text).toBe('hello');
  });

  it('may not read the dashboard, reports, teams or leads', async () => {
    for (const url of [
      '/api/dashboard/overview',
      '/api/dashboard/kpis',
      '/api/reports/status',
      '/api/teams',
      '/api/leads',
    ]) {
      expect([url, (await as(viewer).get(url)).status]).toEqual([url, 403]);
    }
  });
});

describe('viewer: writes', () => {
  it('is refused every task, planning, project and people write with 403', async () => {
    const t = `/api/tasks/${ids.task}`;
    const v = as(viewer);
    const attempts: Array<[string, Promise<request.Response>]> = [
      ['create task', v.post('/api/tasks', { projectId: ids.mine, title: 'Nope' })],
      ['update task', v.patch(t, { title: 'Nope' })],
      ['change status', v.patch(t, { status: 'DONE' })],
      ['move task', v.patch(`${t}/move`, { status: 'DONE' })],
      ['delete task', v.del(t)],
      ['bulk delete', v.post('/api/tasks/bulk-delete', { ids: [ids.task] })],
      ['log hours', v.post(`${t}/worklogs`, { hours: 1 })],
      ['comment', v.post(`${t}/comments`, { body: 'Hi' })],
      ['edit comment', v.patch(`${t}/comments/${ids.comment}`, { body: 'Hi' })],
      ['delete comment', v.del(`${t}/comments/${ids.comment}`)],
      ['add link', v.post(`${t}/links`, { kind: 'BLOCKS', targetKey: `${MINE}-2` })],
      ['remove link', v.del(`${t}/links/${ids.link}`)],
      [
        'upload',
        request(app)
          .post(`${t}/attachments`)
          .query({ name: 'x.txt' })
          .auth(viewer, { type: 'bearer' })
          .set('Content-Type', 'text/plain')
          .send('x'),
      ],
      ['delete attachment', v.del(`/api/attachments/${ids.attachment}`)],
      ['create sprint', v.post('/api/sprints', { projectId: ids.mine, name: 'S' })],
      ['start sprint', v.patch(`/api/sprints/${ids.sprint}`, { status: 'ACTIVE' })],
      ['delete sprint', v.del(`/api/sprints/${ids.sprint}`)],
      ['create epic', v.post('/api/epics', { projectId: ids.mine, name: 'E' })],
      ['update epic', v.patch(`/api/epics/${ids.epic}`, { name: 'E2' })],
      ['delete epic', v.del(`/api/epics/${ids.epic}`)],
      ['create project', v.post('/api/projects', { code: `VY${suffix}`, name: 'Nope' })],
      ['update project', v.patch(`/api/projects/${ids.mine}`, { name: 'Nope' })],
      ['staff project', v.put(`/api/projects/${ids.mine}/members`, { personIds: [] })],
      ['delete project', v.del(`/api/projects/${ids.mine}`)],
      [
        'add person',
        v.post('/api/people', { name: 'X', email: 'x@example.com', password: 'Password1' }),
      ],
      ['edit person', v.patch(`/api/people/${memberId}`, { title: 'Nope' })],
      ['staff person', v.put(`/api/people/${memberId}/projects`, { projectIds: [] })],
      ['remove person', v.del(`/api/people/${memberId}`)],
      ['add lead', v.post('/api/leads', { company: 'X', contactName: 'Y' })],
    ];
    for (const [what, attempt] of attempts) {
      expect([what, (await attempt).status]).toEqual([what, 403]);
    }

    // Nothing changed.
    const task = await prisma.task.findUniqueOrThrow({ where: { id: ids.task } });
    expect(task.title).toBe('Viewer task');
    expect(task.status).not.toBe('DONE');
    expect(await prisma.comment.count({ where: { taskId: ids.task } })).toBe(1);
    expect(await prisma.attachment.count({ where: { taskId: ids.task } })).toBe(1);
    expect(await prisma.worklog.count({ where: { taskId: ids.task } })).toBe(0);
  });

  it('keeps personal settings: saved filters and notification read state', async () => {
    const saved = await as(viewer).post('/api/filters', {
      name: 'Mine',
      projectId: ids.mine,
      query: 'label=ui',
    });
    expect(saved.status).toBe(201);
    expect((await as(viewer).del(`/api/filters/${saved.body.id}`)).status).toBe(204);
    expect((await as(viewer).post('/api/notifications/read-all')).status).toBe(200);
  });

  it('the services refuse a viewer too, even one left as an assignee', async () => {
    // E.g. a member who was assigned work and later made a viewer.
    await prisma.task.update({ where: { id: ids.task2 }, data: { assigneeId: viewerUser.id } });
    const refused = { status: 403 };
    await expect(tasks.updateTask(viewerUser, ids.task2, { status: 'DONE' })).rejects.toMatchObject(
      refused,
    );
    await expect(tasks.moveTask(viewerUser, ids.task2, 'DONE', {})).rejects.toMatchObject(refused);
    await expect(
      tasks.logWork(viewerUser, ids.task2, { hours: 1, date: new Date() }),
    ).rejects.toMatchObject(refused);
    await expect(comments.addComment(viewerUser, ids.task2, 'Hi')).rejects.toMatchObject(refused);
    await expect(
      links.addLink(viewerUser, ids.task2, { kind: 'RELATES', targetKey: `${MINE}-1` }),
    ).rejects.toMatchObject(refused);
    await expect(
      attachments.addAttachment(viewerUser, ids.task2, { name: 'a.txt', bytes: Buffer.from('a') }),
    ).rejects.toMatchObject(refused);
    await prisma.task.update({ where: { id: ids.task2 }, data: { assigneeId: null } });
  });

  it('a viewer can’t be made a task’s assignee', async () => {
    const created = await as(admin).post('/api/tasks', {
      projectId: ids.mine,
      title: 'For the viewer',
      assigneeId: viewerUser.id,
    });
    expect(created.status).toBe(400);
    expect(created.body.details.fieldErrors.assigneeId).toBeDefined();
    const updated = await as(admin).patch(`/api/tasks/${ids.task}`, {
      assigneeId: viewerUser.id,
    });
    expect(updated.status).toBe(400);
    // A member on the same project still can be.
    const member = await as(admin).patch(`/api/tasks/${ids.task}`, { assigneeId: memberId });
    expect(member.status).toBe(200);
  });

  it('the project list tells the forms who is a viewer', async () => {
    const project = (await as(admin).get('/api/projects')).body.find(
      (p: { id: string }) => p.id === ids.mine,
    );
    expect(project.members).toContainEqual(
      expect.objectContaining({ id: viewerUser.id, role: 'VIEWER' }),
    );
  });

  it('Claude connector tools that write are refused for a viewer', async () => {
    const api = loopbackApi(app)(viewerUser);
    const calls = [
      api('POST', '/tasks', { projectId: ids.mine, title: 'Via Claude' }),
      api('PATCH', `/tasks/${ids.task}`, { status: 'DONE' }),
      api('POST', `/tasks/${ids.task}/worklogs`, { hours: 1 }),
      api('POST', '/leads', { company: 'X', contactName: 'Y' }),
      api('PATCH', `/leads/anything`, { stage: 'WON' }),
      api('GET', '/dashboard/overview'),
      api('GET', '/reports/status'),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toMatch(/^403:/);
    }
    const read = await api('GET', `/tasks?projectId=${ids.mine}`);
    expect(read.isError).toBeUndefined();
  });
});
