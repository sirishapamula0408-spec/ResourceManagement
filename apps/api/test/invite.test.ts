import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Capture invitation emails instead of sending them.
const sent = vi.hoisted(() => [] as { to: string; text: string }[]);
vi.mock('../src/lib/mailer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mailer.js')>()),
  sendMail: async (mail: { to: string; text: string }) => {
    sent.push(mail);
  },
}));

const app = createApp();
const email = `invite.test.${Date.now()}@resourceboard.local`;
let admin: string;

const tokenFor = (to: string) => {
  const mail = sent.filter((m) => m.to === to).at(-1);
  return mail?.text.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1] ?? '';
};

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  admin = res.body.token;
});

afterAll(async () => {
  const person = await prisma.person.findUnique({ where: { email } });
  if (person) {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: person.id }, { entityId: person.id }] },
    });
    await prisma.person.delete({ where: { id: person.id } });
  }
});

describe('email invitations', () => {
  let personId: string;

  it('emails an invitation when a person is added without a password', async () => {
    const res = await request(app)
      .post('/api/people')
      .auth(admin, { type: 'bearer' })
      .send({ name: 'Invited Person', email });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ invitePending: true });
    expect(res.body.inviteTokenHash).toBeUndefined();
    personId = res.body.id;
    expect(tokenFor(email)).not.toBe('');
  });

  it('cannot sign in before accepting', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'Welcome123' });
    expect(res.status).toBe(401);
  });

  it('resending replaces the link', async () => {
    const first = tokenFor(email);
    const res = await request(app)
      .post(`/api/people/${personId}/invite`)
      .auth(admin, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(tokenFor(email)).not.toBe(first);
    expect((await request(app).get(`/api/auth/invite/${first}`)).status).toBe(404);
  });

  it('shows who the invitation is for', async () => {
    const res = await request(app).get(`/api/auth/invite/${tokenFor(email)}`);
    expect(res.body).toEqual({ name: 'Invited Person', email });
  });

  it('applies the password rule', async () => {
    const res = await request(app)
      .post('/api/auth/invite/accept')
      .send({ token: tokenFor(email), password: 'short' });
    expect(res.status).toBe(400);
  });

  it('accepts once, then the person signs in', async () => {
    const token = tokenFor(email);
    const res = await request(app)
      .post('/api/auth/invite/accept')
      .send({ token, password: 'Welcome123' });
    expect(res.body).toEqual({ email });

    const again = await request(app)
      .post('/api/auth/invite/accept')
      .send({ token, password: 'Other1234' });
    expect(again.status).toBe(404);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Welcome123' });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ email, mustChangePassword: false });
  });

  it('refuses expired links', async () => {
    await prisma.person.update({ where: { id: personId }, data: { passwordHash: null } });
    await request(app).post(`/api/people/${personId}/invite`).auth(admin, { type: 'bearer' });
    await prisma.person.update({
      where: { id: personId },
      data: { inviteExpiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app).get(`/api/auth/invite/${tokenFor(email)}`);
    expect(res.status).toBe(410);
  });

  it('cannot re-invite someone who already has a password', async () => {
    const res = await request(app)
      .post(
        '/api/people/' +
          (await prisma.person.findUnique({ where: { email: 'admin@resourceboard.local' } }))!.id +
          '/invite',
      )
      .auth(admin, { type: 'bearer' });
    expect(res.status).toBe(400);
  });
});
