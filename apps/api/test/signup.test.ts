import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Sign-up is off unless SIGNUP_DOMAINS lists domains; turn it on for the sample domain before
// the config is read (vi.hoisted runs ahead of the imports).
vi.hoisted(() => {
  process.env.SIGNUP_DOMAINS = 'resourceboard.local';
});
const app = createApp();
const email = `signup.test.${Date.now()}@resourceboard.local`;

afterAll(async () => {
  await prisma.person.deleteMany({ where: { email } });
});

const signup = (body: object) => request(app).post('/api/auth/signup').send(body);

describe('self sign-up', () => {
  it('tells the login page which domains may sign up', async () => {
    const res = await request(app).get('/api/auth/signup');
    expect(res.body).toEqual({ domains: ['resourceboard.local'] });
  });

  it('refuses other email domains', async () => {
    const res = await signup({ name: 'Out Sider', email: 'out@gmail.com', password: 'Welcome123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('@resourceboard.local');
  });

  it('applies the password rule', async () => {
    const res = await signup({ name: 'Weak', email, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('creates a team member who is signed in straight away', async () => {
    const res = await signup({
      name: 'New Starter',
      email: email.toUpperCase(),
      password: 'Welcome123',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, role: 'MEMBER', mustChangePassword: false });

    const me = await request(app).get('/api/auth/me').auth(res.body.token, { type: 'bearer' });
    expect(me.body).toMatchObject({ name: 'New Starter', role: 'MEMBER' });
  });

  it('does not take over an existing account', async () => {
    const res = await signup({
      name: 'Imposter',
      email: 'admin@resourceboard.local',
      password: 'Welcome123',
    });
    expect(res.status).toBe(409);
  });
});
