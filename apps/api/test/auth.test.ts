import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';

// Sign-up must be off when SIGNUP_DOMAINS is not set (vi.hoisted runs before the config is read).
vi.hoisted(() => {
  delete process.env.SIGNUP_DOMAINS;
});

// Sign-in hardening: identical failures, lockout, disabled accounts and the audit log. Uses its
// own people so the seeded admin (which other tests sign in as) is never locked.
const app = createApp();
const suffix = Date.now().toString(36);
const PASSWORD = 'Correct-Horse-9';
const EMAILS = {
  user: `auth.user.${suffix}@resourceboard.local`,
  disabled: `auth.disabled.${suffix}@resourceboard.local`,
  lock: `auth.lock.${suffix}@resourceboard.local`,
  unknown: `auth.nobody.${suffix}@resourceboard.local`,
};
const ids: Record<string, string> = {};

const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  for (const [key, email] of Object.entries(EMAILS)) {
    if (key === 'unknown') continue;
    const person = await prisma.person.create({
      data: {
        name: `Auth ${key}`,
        email,
        role: 'MEMBER',
        passwordHash,
        active: key !== 'disabled',
      },
    });
    ids[key] = person.id;
  }
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: 'Person', entityId: { in: Object.values(ids) } },
        { action: { startsWith: 'auth.' }, after: { path: ['email'], equals: EMAILS.unknown } },
      ],
    },
  });
  await prisma.person.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
});

describe('sign-in hardening', () => {
  it('answers an unknown email exactly like a wrong password', async () => {
    const unknown = await login(EMAILS.unknown, PASSWORD);
    const wrong = await login(EMAILS.user, 'not-the-password');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body).toEqual({ error: 'Invalid credentials' });
  });

  it('reports a disabled account only after the right password', async () => {
    const wrong = await login(EMAILS.disabled, 'not-the-password');
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: 'Invalid credentials' });

    const right = await login(EMAILS.disabled, PASSWORD);
    expect(right.status).toBe(403);
    expect(right.body.details).toEqual({ code: 'ACCOUNT_DISABLED' });
    expect(right.body.token).toBeUndefined();
  });

  it('locks an account after five failures; a successful sign-in clears the count', async () => {
    for (let i = 0; i < 4; i++) expect((await login(EMAILS.lock, 'wrong')).status).toBe(401);
    expect((await login(EMAILS.lock, PASSWORD)).status).toBe(200);

    // The earlier four no longer count: four more are still plain failures.
    for (let i = 0; i < 4; i++) expect((await login(EMAILS.lock, 'wrong')).status).toBe(401);
    const fifth = await login(EMAILS.lock, 'wrong');
    expect(fifth.status).toBe(423);
    expect(fifth.body.details).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect(fifth.body.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(fifth.headers['retry-after'])).toBe(fifth.body.details.retryAfterSeconds);

    // Locked means locked, even with the right password.
    const after = await login(EMAILS.lock, PASSWORD);
    expect(after.status).toBe(423);
    expect(Number(after.headers['retry-after'])).toBeGreaterThan(0);
    expect(after.body.token).toBeUndefined();
  });

  it('writes sign-ins, failures and lockouts to the audit log', async () => {
    expect((await login(EMAILS.user, PASSWORD)).status).toBe(200);
    const rows = await prisma.auditLog.findMany({
      where: { entityType: 'Person', entityId: { in: [ids.user, ids.lock, ids.disabled] } },
    });
    const count = (action: string, id: string) =>
      rows.filter((r) => r.action === action && r.entityId === id).length;

    expect(count('auth.login', ids.user)).toBe(1);
    expect(count('auth.login_failed', ids.user)).toBe(1);
    expect(count('auth.login_failed', ids.disabled)).toBe(2);
    expect(count('auth.login', ids.lock)).toBe(1);
    expect(count('auth.login_failed', ids.lock)).toBe(9);
    expect(count('auth.locked', ids.lock)).toBe(1);

    const success = rows.find((r) => r.action === 'auth.login' && r.entityId === ids.user)!;
    expect(success.actorId).toBe(ids.user);
    expect(success.ip).toBeTruthy();

    // Unknown emails are logged too, by the address that was tried.
    const unknown = await prisma.auditLog.count({
      where: { action: 'auth.login_failed', after: { path: ['email'], equals: EMAILS.unknown } },
    });
    expect(unknown).toBe(1);
  });
});

describe('self-registration', () => {
  it('is off unless SIGNUP_DOMAINS is set', async () => {
    expect((await request(app).get('/api/auth/signup')).body).toEqual({ domains: [] });
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Walk In', email: EMAILS.unknown, password: 'Welcome123' });
    expect(res.status).toBe(403);
    expect(await prisma.person.count({ where: { email: EMAILS.unknown } })).toBe(0);
  });
});
