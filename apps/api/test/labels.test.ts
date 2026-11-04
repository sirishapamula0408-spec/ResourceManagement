import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Labels on tasks (M4 JIRA-lite).
const app = createApp();
const CODE = `LB${Date.now().toString(36).slice(-5).toUpperCase()}`;
// Unique to this run, so other data in the database does not affect the counts.
const L = (name: string) => `${name}-${CODE.toLowerCase()}`;
let token: string;
let projectId: string;

const as = () => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(token, { type: 'bearer' }).send(body),
});

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  token = login.body.token;
  projectId = (await as().post('/api/projects', { code: CODE, name: `Labels ${CODE}` })).body.id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { code: CODE } });
});

describe('task labels', () => {
  let taskId: string;

  it('stores labels as lowercase words without duplicates', async () => {
    const res = await as().post('/api/tasks', {
      projectId,
      title: 'Labelled',
      labels: [`Customer Request ${CODE}`, L('frontend'), ` ${L('FRONTEND')} `],
    });
    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual([`customer-request-${CODE.toLowerCase()}`, L('frontend')]);
    taskId = res.body.id;
  });

  it('refuses too many or too long labels', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `l${i}`);
    expect((await as().post('/api/tasks', { projectId, title: 'X', labels: many })).status).toBe(
      400,
    );
    const long = 'x'.repeat(31);
    expect((await as().post('/api/tasks', { projectId, title: 'X', labels: [long] })).status).toBe(
      400,
    );
  });

  it('filters tasks by label and lists labels in use with counts', async () => {
    await as().post('/api/tasks', { projectId, title: 'Also frontend', labels: [L('frontend')] });
    await as().post('/api/tasks', { projectId, title: 'Plain' });

    const tagged = await as().get(`/api/tasks?projectId=${projectId}&label=${L('frontend')}`);
    expect(tagged.body.map((t: { title: string }) => t.title).sort()).toEqual([
      'Also frontend',
      'Labelled',
    ]);

    const labels = await as().get('/api/tasks/labels');
    const mine = labels.body.filter((l: { name: string }) => l.name.endsWith(CODE.toLowerCase()));
    expect(mine).toEqual([
      { name: L('frontend'), tasks: 2 },
      { name: `customer-request-${CODE.toLowerCase()}`, tasks: 1 },
    ]);
  });

  it('replaces the labels on edit, and clears them with an empty list', async () => {
    const edited = await as().patch(`/api/tasks/${taskId}`, { labels: [L('backend')] });
    expect(edited.body.labels).toEqual([L('backend')]);
    const cleared = await as().patch(`/api/tasks/${taskId}`, { labels: [] });
    expect(cleared.body.labels).toEqual([]);
  });
});
