import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { open, seal } from '../src/lib/secretBox.js';
import {
  base32Decode,
  base32Encode,
  codeFor,
  matchStep,
  otpauthUrl,
  PERIOD_SECONDS,
  stepAt,
} from '../src/lib/totp.js';

// Two-step sign-in with an authenticator app (AS-25, AS-26).
const app = createApp();
const TAG = Date.now().toString(36);
const EMAIL = `mfa-${TAG}@example.test`;
const PASSWORD = 'Start1234';
let admin: string;
let personId: string;

describe('TOTP codes', () => {
  // RFC 6238 appendix B (SHA-1), secret "12345678901234567890", last 6 of the 8 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('match the RFC 6238 test values', () => {
    for (const [seconds, code] of [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ] as const) {
      expect(codeFor(secret, Math.floor(seconds / PERIOD_SECONDS))).toBe(code);
    }
  });

  it('round-trips base32 and accepts one step of clock drift either side', () => {
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    const now = Date.UTC(2026, 10, 5, 12, 0, 10);
    const step = stepAt(now);
    expect(matchStep(secret, codeFor(secret, step), now)).toBe(step);
    expect(matchStep(secret, codeFor(secret, step - 1), now)).toBe(step - 1);
    expect(matchStep(secret, codeFor(secret, step + 1), now)).toBe(step + 1);
    expect(matchStep(secret, codeFor(secret, step - 2), now)).toBeNull();
    expect(matchStep(secret, '12345', now)).toBeNull();
  });

  it('builds the link Microsoft Authenticator reads', () => {
    expect(otpauthUrl('ABCD', 'a@b.test', 'SedHub')).toBe(
      'otpauth://totp/SedHub%3Aa%40b.test?secret=ABCD&issuer=SedHub&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('keeps secrets encrypted', () => {
    const sealed = seal('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(open(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });
});

const login = () => request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
const as = (token: string) => ({
  get: (url: string) => request(app).get(url).auth(token, { type: 'bearer' }),
  post: (url: string, body: object = {}) =>
    request(app).post(url).auth(token, { type: 'bearer' }).send(body),
  delete: (url: string) => request(app).delete(url).auth(token, { type: 'bearer' }),
});
/** The secret as stored, to produce codes like the app would. */
const storedSecret = async () =>
  open((await prisma.person.findUniqueOrThrow({ where: { id: personId } })).mfaSecret!);

beforeAll(async () => {
  admin = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' })
  ).body.token;
  personId = (
    await as(admin).post('/api/people', { name: `MFA ${TAG}`, email: EMAIL, password: PASSWORD })
  ).body.id;
  await prisma.person.update({ where: { id: personId }, data: { mustChangePassword: false } });
});

afterAll(async () => {
  await prisma.person.deleteMany({ where: { id: personId } });
});

describe('two-step sign-in', () => {
  let session: string;
  let secret: string;

  it('is off until set up: the password alone signs in', async () => {
    const res = await login();
    expect(res.body.token).toBeTruthy();
    session = res.body.token;
    expect((await as(session).get('/api/auth/mfa')).body).toEqual({ enabled: false });
  });

  it('sets up with a QR code and needs a correct first code', async () => {
    const setup = await as(session).post('/api/auth/mfa/setup');
    expect(setup.status).toBe(200);
    expect(setup.body.qrSvg).toMatch(/^<svg/);
    expect(setup.body.otpauthUrl).toContain(`SedHub%3A${encodeURIComponent(EMAIL)}`);
    secret = await storedSecret();
    expect(setup.body.secret.replace(/ /g, '')).toBe(secret);

    expect((await as(session).post('/api/auth/mfa/enable', { code: '000000' })).status).toBe(400);
    const ok = await as(session).post('/api/auth/mfa/enable', {
      code: codeFor(secret, stepAt()),
    });
    expect(ok.status).toBe(204);
    expect((await as(session).get('/api/auth/mfa')).body).toEqual({ enabled: true });
    expect((await as(session).post('/api/auth/mfa/setup')).status).toBe(409);
  });

  it('then asks for a code after the password, and refuses a wrong or reused one', async () => {
    const first = await login();
    expect(first.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(first.body.token).toBeUndefined();
    // The MFA token is not a session.
    expect((await as(first.body.mfaToken).get('/api/auth/me')).status).toBe(401);

    const verify = (code: string) =>
      request(app).post('/api/auth/mfa/verify').send({ mfaToken: first.body.mfaToken, code });
    expect((await verify('000000')).status).toBe(401);
    // The code used to switch it on (this step) was spent; the next step's code works.
    const next = codeFor(secret, stepAt() + 1);
    const ok = await verify(next);
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(EMAIL);
    expect((await as(ok.body.token).get('/api/auth/me')).status).toBe(200);
    // Each code works once.
    expect((await verify(next)).status).toBe(401);
  });

  it('locks after five wrong codes', async () => {
    const { mfaToken } = (await login()).body;
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      statuses.push(
        (await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: '000000' })).status,
      );
    }
    // The reused code in the previous test was the first of the five failures.
    expect(statuses).toEqual([401, 401, 401, 423, 423]);
  });

  it('records MFA sign-ins and failures in the audit log', async () => {
    const res = await as(admin).get('/api/audit?area=auth&limit=200');
    const mine = res.body.entries.filter((e: { entityId: string }) => e.entityId === personId);
    const actions = mine.map((e: { action: string }) => e.action);
    expect(actions).toContain('auth.mfa_enabled');
    expect(actions).toContain('auth.mfa_failed');
    expect(
      mine.find((e: { action: string; after: unknown }) => e.action === 'auth.login' && e.after)
        ?.after,
    ).toEqual({ mfa: true });
  });

  it('can be reset by an admin only, after which the password alone signs in again', async () => {
    expect((await as(session).delete(`/api/people/${personId}/mfa`)).status).toBe(403);
    expect((await as(admin).delete(`/api/people/${personId}/mfa`)).status).toBe(204);
    expect((await login()).body.token).toBeTruthy();
  });

  it('can be turned off by the person with their password', async () => {
    await as(session).post('/api/auth/mfa/setup');
    secret = await storedSecret();
    await as(session).post('/api/auth/mfa/enable', { code: codeFor(secret, stepAt()) });
    expect((await as(session).post('/api/auth/mfa/disable', { password: 'nope' })).status).toBe(
      400,
    );
    expect((await as(session).post('/api/auth/mfa/disable', { password: PASSWORD })).status).toBe(
      204,
    );
    expect((await as(session).get('/api/auth/mfa')).body).toEqual({ enabled: false });
  });
});
