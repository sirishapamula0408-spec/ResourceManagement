import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

// Saved filters (M4 JIRA-lite): each person's own, per project or for the main pages.
const app = createApp();
const CODE = `SF${Date.now().toString(36).slice(-5).toUpperCase()}`;
const EMAIL = `filters.member.${CODE.toLowerCase()}@resourceboard.local`;
let admin: string;
let other: string;
let projectId: string;

const as = (token: string) => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  del: (url: string) => request(app).delete(url).auth(token, { type: 'bearer' }),
});
const names = async (token: string, query = '') =>
  (await as(token).get(`/api/filters${query}`)).body.map((f: { name: string }) => f.name);

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  admin = login.body.token;
  projectId = (await as(admin).post('/api/projects', { code: CODE, name: `Filters ${CODE}` })).body
    .id;
  const person = await prisma.person.create({
    data: { name: 'Filters Member', email: EMAIL, role: 'MEMBER' },
  });
  other = signToken({ id: person.id, email: person.email, role: 'MEMBER' });
});

afterAll(async () => {
  await prisma.savedFilter.deleteMany({ where: { name: { startsWith: CODE } } });
  await prisma.project.deleteMany({ where: { code: CODE } });
  await prisma.person.deleteMany({ where: { email: EMAIL } });
});

describe('saved filters', () => {
  let globalId: string;

  it('saves filters for the main pages and for a project separately', async () => {
    const g = await as(admin).post('/api/filters', {
      name: `${CODE} my open work`,
      query: 'assignee=abc&label=ui',
    });
    expect(g.status).toBe(201);
    globalId = g.body.id;
    const p = await as(admin).post('/api/filters', {
      name: `${CODE} sprint bugs`,
      projectId,
      query: 'sprint=&q=bug',
    });
    expect(p.status).toBe(201);
    expect(await names(admin)).toContain(`${CODE} my open work`);
    expect(await names(admin)).not.toContain(`${CODE} sprint bugs`);
    expect(await names(admin, `?projectId=${projectId}`)).toEqual([`${CODE} sprint bugs`]);
  });

  it('refuses a duplicate name in the same place, and anything that is not a task filter', async () => {
    const dup = await as(admin).post('/api/filters', {
      name: `${CODE} MY OPEN WORK`,
      query: 'label=x',
    });
    expect(dup.status).toBe(409);
    const bad = await as(admin).post('/api/filters', { name: `${CODE} bad`, query: 'next=/admin' });
    expect(bad.status).toBe(400);
  });

  it('keeps each person to their own filters', async () => {
    expect(await names(other)).not.toContain(`${CODE} my open work`);
    expect((await as(other).del(`/api/filters/${globalId}`)).status).toBe(404);
    expect((await as(admin).del(`/api/filters/${globalId}`)).status).toBe(204);
    expect(await names(admin)).not.toContain(`${CODE} my open work`);
  });
});
