import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Recording leave, and leave lowering capacity on the dashboard (M2-07, M2-08).
const app = createApp();
const TAG = Date.now().toString(36);
const CODE = `LV${TAG.slice(-5).toUpperCase()}`;
// A week far ahead, so nothing else in the database is scheduled against these people.
const MONDAY = '2031-03-03';
let admin: string;
let member: string;
let personId: string;
let otherId: string;

const call = (token: string) => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(token, { type: 'bearer' }).send(body),
  delete: (url: string) => request(app).delete(url).auth(token, { type: 'bearer' }),
});

const week = async () => {
  const res = await call(admin).get(`/api/dashboard/heatmap?from=${MONDAY}&weeks=1`);
  return res.body.rows.find((r: { personId: string }) => r.personId === personId).cells[0];
};

beforeAll(async () => {
  admin = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' })
  ).body.token;
  const make = async (n: string) =>
    (
      await call(admin).post('/api/people', {
        name: `Leave ${n} ${TAG}`,
        email: `leave-${n}-${TAG}@example.test`,
        password: 'Start1234',
        weeklyCapacityHours: 40,
      })
    ).body.id as string;
  personId = await make('a');
  otherId = await make('b');
  await prisma.person.update({ where: { id: personId }, data: { mustChangePassword: false } });
  member = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: `leave-a-${TAG}@example.test`, password: 'Start1234' })
  ).body.token;

  // 40 hours of work for the person, Monday to Friday of that week.
  const project = await call(admin).post('/api/projects', { code: CODE, name: `Leave ${CODE}` });
  await request(app)
    .put(`/api/people/${personId}/projects`)
    .auth(admin, { type: 'bearer' })
    .send({ projectIds: [project.body.id] });
  const task = await call(admin).post('/api/tasks', {
    projectId: project.body.id,
    title: 'Week of work',
    status: 'TODO',
    assigneeId: personId,
    estimateHours: 40,
    startDate: MONDAY,
    dueDate: '2031-03-07',
  });
  expect(task.status).toBe(201);
});

afterAll(async () => {
  await prisma.task.deleteMany({ where: { project: { code: CODE } } });
  await prisma.project.deleteMany({ where: { code: CODE } });
  await prisma.person.deleteMany({ where: { id: { in: [personId, otherId] } } });
});

describe('leave', () => {
  let leaveId: string;

  it('starts at full capacity', async () => {
    expect(await week()).toMatchObject({ hours: 40, capacityHours: 40, leaveDays: 0, pct: 100 });
  });

  it('lets a person record their own leave, but not someone else’s', async () => {
    const res = await call(member).post('/api/leave', {
      personId,
      startDate: '2031-03-06',
      endDate: '2031-03-09',
      type: 'SICK',
      note: 'Flu',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'SICK', note: 'Flu', person: { id: personId } });
    leaveId = res.body.id;
    const other = await call(member).post('/api/leave', {
      personId: otherId,
      startDate: '2031-03-06',
      endDate: '2031-03-06',
    });
    expect(other.status).toBe(403);
  });

  it('refuses a last day before the first day', async () => {
    const res = await call(admin).post('/api/leave', {
      personId,
      startDate: '2031-03-06',
      endDate: '2031-03-05',
    });
    expect(res.status).toBe(400);
  });

  it('takes a fifth of the week’s capacity per working day of leave', async () => {
    // Thursday and Friday fall in the week; the following Monday does not.
    expect(await week()).toMatchObject({ hours: 40, capacityHours: 24, leaveDays: 2, pct: 166.7 });
  });

  it('counts overlapping leave once', async () => {
    await call(admin).post('/api/leave', {
      personId,
      startDate: '2031-03-05',
      endDate: '2031-03-07',
      type: 'TRAINING',
    });
    expect(await week()).toMatchObject({ capacityHours: 16, leaveDays: 3 });
  });

  it('marks a whole week of leave with planned work as over-allocated', async () => {
    await call(admin).patch(`/api/leave/${leaveId}`, { startDate: MONDAY });
    expect(await week()).toMatchObject({ capacityHours: 0, leaveDays: 5, band: 'over' });
  });

  it('lists a member’s own leave only, and lets them delete it', async () => {
    const mine = await call(member).get(`/api/leave?from=${MONDAY}&to=2031-03-31`);
    expect(mine.body).toHaveLength(2);
    expect(mine.body.every((l: { personId: string }) => l.personId === personId)).toBe(true);
    for (const l of mine.body) {
      expect((await call(member).delete(`/api/leave/${l.id}`)).status).toBe(204);
    }
    expect(await week()).toMatchObject({ capacityHours: 40, leaveDays: 0 });
  });
});
