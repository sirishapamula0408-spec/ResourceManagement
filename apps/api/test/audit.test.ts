import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Changes and sign-ins in the audit log, and the admin view of it (M3-07, M3-08).
const app = createApp();
const TAG = Date.now().toString(36);
const EMAIL = `audit-${TAG}@example.test`;
let admin: string;
let adminId: string;
let personId: string;
let teamId: string;

const as = (token: string) => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(token, { type: 'bearer' }).send(body),
});

type Entry = {
  action: string;
  entityId: string | null;
  entity: string | null;
  actor: { id: string; name: string } | null;
  after: Record<string, unknown> | null;
};
const find = (entries: Entry[], action: string, entityId: string) =>
  entries.find((e) => e.action === action && e.entityId === entityId);

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  admin = login.body.token;
  adminId = login.body.user.id;
  personId = (
    await as(admin).post('/api/people', {
      name: `Audit ${TAG}`,
      email: EMAIL,
      role: 'PM',
      password: 'Start1234',
    })
  ).body.id;
  await as(admin).patch(`/api/people/${personId}`, { title: 'Lead', password: 'Reset1234' });
  teamId = (await as(admin).post('/api/teams', { name: `Audit team ${TAG}` })).body.id;
});

afterAll(async () => {
  await prisma.team.deleteMany({ where: { id: teamId } });
  await prisma.person.deleteMany({ where: { id: personId } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [personId, teamId] } } });
});

describe('audit log', () => {
  it('records people and team changes by the signed-in admin, never the password', async () => {
    const res = await as(admin).get('/api/audit?area=person&limit=200');
    expect(res.status).toBe(200);
    const created = find(res.body.entries, 'person.create', personId)!;
    expect(created.actor?.id).toBe(adminId);
    expect(created.entity).toBe(`Audit ${TAG}`);
    expect(created.after).toMatchObject({ email: EMAIL, role: 'PM' });
    expect(created.after).not.toHaveProperty('password');
    const updated = find(res.body.entries, 'person.update', personId)!;
    expect(updated.after).toEqual({ title: 'Lead', passwordReset: true });
    expect(JSON.stringify(res.body)).not.toContain('Reset1234');

    const teams = await as(admin).get('/api/audit?area=team&limit=200');
    expect(find(teams.body.entries, 'team.create', teamId)?.entity).toBe(`Audit team ${TAG}`);
  });

  it('records sign-ins, including failed ones', async () => {
    await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'wrong-pass1' });
    const res = await as(admin).get(`/api/audit?area=auth&limit=200`);
    expect(res.body.entries.some((e: Entry) => e.action === 'auth.login_failed')).toBe(true);
    expect(res.body.entries.some((e: Entry) => e.action === 'auth.login')).toBe(true);
  });

  it('pages through entries newest first', async () => {
    const first = await as(admin).get('/api/audit?limit=2');
    expect(first.body.entries).toHaveLength(2);
    const second = await as(admin).get(`/api/audit?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.entries[0].id).not.toBe(first.body.entries[1].id);
    expect(Date.parse(second.body.entries[0].at)).toBeLessThanOrEqual(
      Date.parse(first.body.entries[1].at),
    );
  });

  it('is for admins only', async () => {
    await prisma.person.update({ where: { id: personId }, data: { mustChangePassword: false } });
    const pm = (
      await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'Reset1234' })
    ).body.token;
    expect((await as(pm).get('/api/audit')).status).toBe(403);
  });
});
