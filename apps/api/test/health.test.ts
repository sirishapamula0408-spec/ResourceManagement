import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { weekStartOf } from '../src/modules/dashboard/dashboard.service.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});

describe('auth guards', () => {
  it('rejects unauthenticated project creation', async () => {
    const res = await request(app).post('/api/projects').send({ code: 'X', name: 'X' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['post', '/api/people'],
    ['patch', '/api/people/p1'],
    ['delete', '/api/people/p1'],
    ['put', '/api/people/p1/projects'],
    ['patch', '/api/projects/x1'],
    ['delete', '/api/projects/x1'],
    ['put', '/api/projects/x1/members'],
    ['post', '/api/tasks'],
    ['patch', '/api/tasks/t1'],
    ['delete', '/api/tasks/t1'],
    ['post', '/api/tasks/t1/worklogs'],
  ] as const)('rejects unauthenticated %s %s', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

describe('weekStartOf', () => {
  it('returns the Monday of the week', () => {
    // Thursday 2026-10-22 -> Monday 2026-10-19
    expect(weekStartOf(new Date('2026-10-22T15:00:00Z')).toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
    // Sunday belongs to the preceding Monday
    expect(weekStartOf(new Date('2026-10-25T10:00:00Z')).toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
  });
});
