import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// The Claude connector end to end, as Claude drives it: register, send the person to sign in and
// approve, swap the code for tokens, then call tools. Uses the seeded accounts (npm run db:seed).
const app = createApp();
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const MCP_URL = 'http://localhost:5173/mcp';
const MCP_HEADERS = { Accept: 'application/json, text/event-stream' };

let clientId: string;

beforeAll(async () => {
  const res = await request(app)
    .post('/register')
    .send({
      client_name: 'Claude (test)',
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  expect(res.status).toBe(201);
  clientId = res.body.client_id;
});

afterAll(async () => {
  // Codes and refresh tokens go with the client (cascade).
  if (clientId) await prisma.oAuthClient.delete({ where: { id: clientId } });
});

/** Starts sign-in like Claude does; returns the consent ticket and the PKCE verifier. */
async function startSignIn() {
  const verifier = randomBytes(32).toString('base64url');
  const res = await request(app)
    .get('/authorize')
    .query({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'state-123',
      resource: MCP_URL,
    });
  expect(res.status).toBe(302);
  const consent = new URL(res.headers.location);
  expect(consent.origin + consent.pathname).toBe('http://localhost:5173/connect');
  return { ticket: consent.searchParams.get('request')!, verifier };
}

async function appToken(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

/** The whole flow for one person; returns their connector tokens. */
async function connect(email: string, password: string) {
  const { ticket, verifier } = await startSignIn();
  const approved = await request(app)
    .post('/api/oauth/approve')
    .auth(await appToken(email, password), { type: 'bearer' })
    .send({ request: ticket });
  expect(approved.status).toBe(200);
  const back = new URL(approved.body.redirect);
  expect(back.searchParams.get('state')).toBe('state-123');

  const tokens = await request(app)
    .post('/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code: back.searchParams.get('code')!,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
    });
  expect(tokens.status).toBe(200);
  return tokens.body as { access_token: string; refresh_token: string };
}

const rpc = (token: string, method: string, params: object = {}) =>
  request(app)
    .post('/mcp')
    .auth(token, { type: 'bearer' })
    .set(MCP_HEADERS)
    .send({ jsonrpc: '2.0', id: 1, method, params });

describe('Claude connector (MCP + OAuth)', () => {
  it('publishes OAuth metadata for the MCP endpoint', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(res.status).toBe(200);
    expect(res.body.resource).toBe(MCP_URL);
  });

  it('asks unauthenticated callers to sign in', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('resource_metadata=');
  });

  it('shows the consent page who is asking', async () => {
    const { ticket } = await startSignIn();
    const res = await request(app)
      .get('/api/oauth/request')
      .auth(await appToken('admin@resourceboard.local', 'Admin@12345'), { type: 'bearer' })
      .query({ request: ticket });
    expect(res.body).toEqual({ clientName: 'Claude (test)', redirectHost: 'claude.ai' });
  });

  it('rejects an altered consent request', async () => {
    const { ticket } = await startSignIn();
    const res = await request(app)
      .post('/api/oauth/approve')
      .auth(await appToken('admin@resourceboard.local', 'Admin@12345'), { type: 'bearer' })
      .send({ request: `${ticket}x` });
    expect(res.status).toBe(400);
  });

  it('sends people who decline back with access_denied', async () => {
    const { ticket } = await startSignIn();
    const res = await request(app)
      .post('/api/oauth/deny')
      .auth(await appToken('admin@resourceboard.local', 'Admin@12345'), { type: 'bearer' })
      .send({ request: ticket });
    expect(new URL(res.body.redirect).searchParams.get('error')).toBe('access_denied');
  });

  it('lets a connected person call tools as themselves', async () => {
    const { access_token } = await connect('admin@resourceboard.local', 'Admin@12345');

    const list = await rpc(access_token, 'tools/list');
    expect(list.status).toBe(200);
    const names = list.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['whoami', 'list_tasks', 'create_lead']));

    const me = await rpc(access_token, 'tools/call', { name: 'whoami', arguments: {} });
    expect(me.body.result.isError).toBeFalsy();
    expect(me.body.result.content[0].text).toContain('admin@resourceboard.local');

    // Connector tokens only work at /mcp, never on the app's own API.
    const rest = await request(app).get('/api/auth/me').auth(access_token, { type: 'bearer' });
    expect(rest.status).toBe(401);
  });

  it('keeps each person to their own role', async () => {
    const { access_token } = await connect('liam.chen@resourceboard.local', 'Password@123');
    const res = await rpc(access_token, 'tools/call', {
      name: 'create_lead',
      arguments: { company: 'Should not exist', contactName: 'Nobody' },
    });
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toMatch(/^403/);
  });

  it('rotates refresh tokens and refuses a reused one', async () => {
    const { refresh_token } = await connect('admin@resourceboard.local', 'Admin@12345');
    const refresh = () =>
      request(app)
        .post('/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token, client_id: clientId });

    const first = await refresh();
    expect(first.status).toBe(200);
    expect(first.body.refresh_token).not.toBe(refresh_token);
    const reused = await refresh();
    expect(reused.status).toBe(400);
    expect(reused.body.error).toBe('invalid_grant');
  });

  it('stops a revoked refresh token working', async () => {
    const { refresh_token } = await connect('admin@resourceboard.local', 'Admin@12345');
    const revoked = await request(app)
      .post('/revoke')
      .type('form')
      .send({ token: refresh_token, client_id: clientId });
    expect(revoked.status).toBe(200);
    const res = await request(app)
      .post('/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token, client_id: clientId });
    expect(res.status).toBe(400);
  });
});
