import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

// Issue links (M4 JIRA-lite): blocks / is blocked by / relates to, across projects.
const app = createApp();
const suffix = Date.now().toString(36).slice(-5).toUpperCase();
const CODES = [`LK${suffix}`, `LM${suffix}`];
const EMAIL = `links.member.${suffix.toLowerCase()}@resourceboard.local`;
let admin: string;
let member: string;
const projectIds: string[] = [];
const ids: Record<string, string> = {};

const as = (token: string) => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  del: (url: string) => request(app).delete(url).auth(token, { type: 'bearer' }),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(token, { type: 'bearer' }).send(body),
});
const link = (token: string, from: string, kind: string, targetKey: string) =>
  as(token).post(`/api/tasks/${ids[from]}/links`, { kind, targetKey });
const kinds = async (task: string) =>
  (await as(admin).get(`/api/tasks/${ids[task]}/links`)).body
    .map((l: { kind: string; task: { key: string } }) => `${l.kind} ${l.task.key}`)
    .sort();

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  admin = login.body.token;
  for (const code of CODES) {
    projectIds.push(
      (await as(admin).post('/api/projects', { code, name: `Links ${code}` })).body.id,
    );
  }
  // A: first project's task 1, B: task 2, C: second project's task 1.
  for (const [name, p] of [
    ['A', 0],
    ['B', 0],
    ['C', 1],
  ] as const) {
    ids[name] = (
      await as(admin).post('/api/tasks', { projectId: projectIds[p], title: `Task ${name}` })
    ).body.id;
  }
  const person = await prisma.person.create({
    data: { name: 'Links Member', email: EMAIL, role: 'MEMBER' },
  });
  await prisma.projectMember.create({ data: { projectId: projectIds[0], personId: person.id } });
  member = signToken({ id: person.id, email: person.email, role: 'MEMBER' });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { code: { in: CODES } } });
  await prisma.person.deleteMany({ where: { email: EMAIL } });
});

describe('issue links', () => {
  const [A, B, C] = [`${CODES[0]}-1`, `${CODES[0]}-2`, `${CODES[1]}-1`];

  it('links tasks by key and shows each link from both sides', async () => {
    expect((await link(admin, 'A', 'BLOCKS', B.toLowerCase())).status).toBe(201);
    expect((await link(admin, 'A', 'RELATES', C)).status).toBe(201);
    expect(await kinds('A')).toEqual([`BLOCKS ${B}`, `RELATES ${C}`]);
    expect(await kinds('B')).toEqual([`BLOCKED_BY ${A}`]);
    expect(await kinds('C')).toEqual([`RELATES ${A}`]);
  });

  it('records "is blocked by" the other way round', async () => {
    expect((await link(admin, 'C', 'BLOCKED_BY', B)).status).toBe(201);
    expect(await kinds('B')).toEqual([`BLOCKED_BY ${A}`, `BLOCKS ${C}`]);
  });

  it('counts open blockers on the task list until the blocker is done', async () => {
    const openBlockers = async () =>
      (await as(admin).get(`/api/tasks?projectId=${projectIds[0]}`)).body.find(
        (t: { id: string }) => t.id === ids.B,
      ).openBlockers;
    expect(await openBlockers()).toBe(1);
    await as(admin).patch(`/api/tasks/${ids.A}`, { status: 'DONE' });
    expect(await openBlockers()).toBe(0);
  });

  it('refuses duplicates, self links and unknown keys', async () => {
    expect((await link(admin, 'B', 'BLOCKED_BY', A)).status).toBe(409);
    expect((await link(admin, 'C', 'RELATES', A)).status).toBe(409);
    expect((await link(admin, 'A', 'RELATES', A)).status).toBe(400);
    expect((await link(admin, 'A', 'RELATES', `${CODES[0]}-99`)).status).toBe(400);
    expect((await link(admin, 'A', 'RELATES', 'not a key')).status).toBe(400);
  });

  it('keeps a team member to tasks they can see and may edit', async () => {
    // Not their project: the task is hidden.
    expect((await as(member).get(`/api/tasks/${ids.C}/links`)).status).toBe(404);
    // Their project, but not their task and not a PM: read only.
    expect((await as(member).get(`/api/tasks/${ids.A}/links`)).status).toBe(200);
    expect((await link(member, 'A', 'RELATES', B)).status).toBe(403);
  });

  it('removes a link from either side, and drops links with a deleted task', async () => {
    const [rel] = (await as(admin).get(`/api/tasks/${ids.C}/links`)).body.filter(
      (l: { kind: string }) => l.kind === 'RELATES',
    );
    expect((await as(admin).del(`/api/tasks/${ids.C}/links/${rel.id}`)).status).toBe(204);
    expect(await kinds('A')).toEqual([`BLOCKS ${B}`]);
    await as(admin).del(`/api/tasks/${ids.A}`);
    expect(await kinds('B')).toEqual([`BLOCKS ${C}`]);
  });
});
