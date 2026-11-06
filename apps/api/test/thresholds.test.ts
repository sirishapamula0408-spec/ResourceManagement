import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Admin-set utilization limits, used by the dashboard KPIs (M2-10, M2-11).
const app = createApp();
let admin: string;
let pm: string;
let pmId: string;
const TAG = Date.now().toString(36);
let saved: { metric: 'UNDER_UTILIZATION' | 'OVER_ALLOCATION'; value: unknown; enabled: boolean }[];

const login = async (email: string, password: string) =>
  (await request(app).post('/api/auth/login').send({ email, password })).body.token as string;

beforeAll(async () => {
  admin = await login('admin@resourceboard.local', 'Admin@12345');
  // A PM of this test's own (the seeded ones may be disabled in a local database).
  const email = `thresholds-pm-${TAG}@example.test`;
  const created = await request(app)
    .post('/api/people')
    .auth(admin, { type: 'bearer' })
    .send({ name: `Thresholds PM ${TAG}`, email, role: 'PM', password: 'Start1234' });
  pmId = created.body.id;
  await prisma.person.update({ where: { id: pmId }, data: { mustChangePassword: false } });
  pm = await login(email, 'Start1234');
  // Put the organisation's limits back afterwards.
  saved = (await prisma.alertThreshold.findMany({
    where: {
      departmentId: null,
      projectId: null,
      metric: { in: ['UNDER_UTILIZATION', 'OVER_ALLOCATION'] },
    },
    select: { metric: true, value: true, enabled: true },
  })) as typeof saved;
});

afterAll(async () => {
  await prisma.person.deleteMany({ where: { id: pmId } });
  await prisma.alertThreshold.deleteMany({
    where: {
      departmentId: null,
      projectId: null,
      metric: { in: ['UNDER_UTILIZATION', 'OVER_ALLOCATION'] },
    },
  });
  if (saved.length)
    await prisma.alertThreshold.createMany({
      data: saved.map((s) => ({ ...s, value: Number(s.value) })),
    });
});

const put = (token: string, body: object) =>
  request(app).put('/api/settings/thresholds').auth(token, { type: 'bearer' }).send(body);
const kpis = async () =>
  (await request(app).get('/api/dashboard/kpis').auth(admin, { type: 'bearer' })).body;

describe('utilization limits', () => {
  it('lets an admin change them, and the dashboard uses them', async () => {
    const res = await put(admin, { underUtilizedPct: 55, overUtilizedPct: 120 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ underUtilizedPct: 55, overUtilizedPct: 120 });
    const read = await request(app).get('/api/settings/thresholds').auth(pm, { type: 'bearer' });
    expect(read.body).toEqual({ underUtilizedPct: 55, overUtilizedPct: 120 });
    expect((await kpis()).thresholds).toEqual({ underUtilizedPct: 55, overUtilizedPct: 120 });
  });

  it('counts more people as under-utilized when the limit goes up', async () => {
    await put(admin, { underUtilizedPct: 1, overUtilizedPct: 300 });
    const low = await kpis();
    await put(admin, { underUtilizedPct: 100, overUtilizedPct: 300 });
    const high = await kpis();
    expect(high.underUtilized).toBeGreaterThanOrEqual(low.underUtilized);
    expect(low.overUtilized).toBe(high.overUtilized);
  });

  it('refuses limits that cross or are out of range', async () => {
    expect((await put(admin, { underUtilizedPct: 90, overUtilizedPct: 80 })).status).toBe(400);
    expect((await put(admin, { underUtilizedPct: 0, overUtilizedPct: 100 })).status).toBe(400);
    expect((await put(admin, { underUtilizedPct: 70, overUtilizedPct: 400 })).status).toBe(400);
  });

  it('is for admins only', async () => {
    expect((await put(pm, { underUtilizedPct: 70, overUtilizedPct: 100 })).status).toBe(403);
  });
});
