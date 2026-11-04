import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

// Comments on tasks (M4 JIRA-lite).
const app = createApp();
const suffix = Date.now().toString(36).slice(-5).toUpperCase();
const CODES = [`CM${suffix}`, `CN${suffix}`];
const EMAIL = `comment.member.${suffix.toLowerCase()}@resourceboard.local`;
let admin: string;
let member: string;
let memberId: string;
let taskId: string;
let hiddenTaskId: string;
let projectId: string;

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
  const ids: string[] = [];
  for (const code of CODES) {
    ids.push((await as(admin).post('/api/projects', { code, name: `Comments ${code}` })).body.id);
  }
  const person = await prisma.person.create({
    data: { name: 'Comment Member', email: EMAIL, role: 'MEMBER' },
  });
  memberId = person.id;
  projectId = ids[0];
  await prisma.projectMember.create({ data: { projectId: ids[0], personId: person.id } });
  member = signToken({ id: person.id, email: person.email, role: 'MEMBER' });
  taskId = (await as(admin).post('/api/tasks', { projectId: ids[0], title: 'Discuss me' })).body.id;
  hiddenTaskId = (await as(admin).post('/api/tasks', { projectId: ids[1], title: 'Not yours' }))
    .body.id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { code: { in: CODES } } });
  await prisma.person.deleteMany({ where: { email: EMAIL } });
});

describe('task comments', () => {
  let adminComment: string;
  let memberComment: string;

  it('lets people who can see a task comment on it, oldest first', async () => {
    const a = await as(admin).post(`/api/tasks/${taskId}/comments`, { body: 'First, from admin' });
    expect(a.status).toBe(201);
    expect(a.body.author.name).toBeTruthy();
    adminComment = a.body.id;
    const m = await as(member).post(`/api/tasks/${taskId}/comments`, { body: '  Reply  ' });
    expect(m.status).toBe(201);
    expect(m.body).toMatchObject({ body: 'Reply', authorId: memberId });
    memberComment = m.body.id;

    const list = await as(member).get(`/api/tasks/${taskId}/comments`);
    expect(list.body.map((c: { body: string }) => c.body)).toEqual(['First, from admin', 'Reply']);
  });

  it('counts comments on the task list', async () => {
    // Only this test's project: other test files add and remove projects at the same time.
    const tasks = await as(admin).get(`/api/tasks?projectId=${projectId}`);
    expect(tasks.body.find((t: { id: string }) => t.id === taskId).commentCount).toBe(2);
  });

  it('refuses empty comments', async () => {
    expect((await as(admin).post(`/api/tasks/${taskId}/comments`, { body: '   ' })).status).toBe(
      400,
    );
  });

  it('hides tasks a team member cannot see', async () => {
    expect((await as(member).get(`/api/tasks/${hiddenTaskId}/comments`)).status).toBe(404);
    expect(
      (await as(member).post(`/api/tasks/${hiddenTaskId}/comments`, { body: 'Hi' })).status,
    ).toBe(404);
  });

  it('lets only the author edit, and the author or an admin delete', async () => {
    const url = `/api/tasks/${taskId}/comments`;
    expect((await as(member).patch(`${url}/${adminComment}`, { body: 'Mine now' })).status).toBe(
      403,
    );
    expect((await as(admin).patch(`${url}/${memberComment}`, { body: 'Edited' })).status).toBe(403);
    const edited = await as(member).patch(`${url}/${memberComment}`, { body: 'Edited reply' });
    expect(edited.body.body).toBe('Edited reply');
    expect((await as(member).del(`${url}/${adminComment}`)).status).toBe(403);
    expect((await as(admin).del(`${url}/${memberComment}`)).status).toBe(204);
    expect((await as(admin).get(url)).body).toHaveLength(1);
  });

  it('removes comments with their task', async () => {
    await as(admin).del(`/api/tasks/${taskId}`);
    expect(await prisma.comment.count({ where: { taskId } })).toBe(0);
  });
});
