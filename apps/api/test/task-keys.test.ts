import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Task keys are "<project code>-<number>", numbered per project. Uses the seeded admin.
const app = createApp();
const suffix = Date.now().toString(36).slice(-5).toUpperCase();
const CODES = [`KA${suffix}`, `KB${suffix}`];
let token: string;
const projectIds: string[] = [];

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  token = login.body.token;
  for (const code of CODES) {
    const res = await request(app)
      .post('/api/projects')
      .auth(token, { type: 'bearer' })
      .send({
        code,
        name: `Key test ${code}`,
      });
    expect(res.status).toBe(201);
    projectIds.push(res.body.id);
  }
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { code: { in: CODES } } });
});

const createTask = (projectId: string, title: string) =>
  request(app).post('/api/tasks').auth(token, { type: 'bearer' }).send({ projectId, title });

const keysOn = async (projectId: string) => {
  const res = await request(app)
    .get('/api/tasks')
    .query({ projectId })
    .auth(token, { type: 'bearer' });
  return res.body.map((t: { key: string; title: string }) => `${t.key} ${t.title}`).sort();
};

describe('task keys', () => {
  it('number each project’s tasks from 1, after its code', async () => {
    const [a, b] = projectIds;
    expect((await createTask(a, 'First')).status).toBe(201);
    expect((await createTask(a, 'Second')).status).toBe(201);
    expect((await createTask(b, 'Other')).status).toBe(201);

    expect(await keysOn(a)).toEqual([`${CODES[0]}-1 First`, `${CODES[0]}-2 Second`]);
    expect(await keysOn(b)).toEqual([`${CODES[1]}-1 Other`]);
  });

  it('give a task moved to another project the next key there', async () => {
    const [a, b] = projectIds;
    const task = await prisma.task.findFirstOrThrow({ where: { projectId: a, number: 2 } });
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .auth(token, { type: 'bearer' })
      .send({ projectId: b });
    expect(res.status).toBe(200);
    expect(await keysOn(b)).toEqual([`${CODES[1]}-1 Other`, `${CODES[1]}-2 Second`]);

    // Numbers are never reused, so ...-2 on the first project stays retired.
    await createTask(a, 'Third');
    expect(await keysOn(a)).toEqual([`${CODES[0]}-1 First`, `${CODES[0]}-3 Third`]);
  });
});
