import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Reordering cards within a board column: a dropped card lands between its new neighbours.
const app = createApp();
const CODE = `RO${Date.now().toString(36).slice(-5).toUpperCase()}`;
let token: string;
let projectId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  token = login.body.token;
  const project = await request(app)
    .post('/api/projects')
    .auth(token, { type: 'bearer' })
    .send({ code: CODE, name: `Reorder test ${CODE}` });
  projectId = project.body.id;
  for (const title of ['A', 'B', 'C']) {
    const res = await request(app)
      .post('/api/tasks')
      .auth(token, { type: 'bearer' })
      .send({ projectId, title, status: 'IN_REVIEW' });
    expect(res.status).toBe(201);
    ids[title] = res.body.id;
  }
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { code: CODE } });
});

const move = (id: string, body: object) =>
  request(app).patch(`/api/tasks/${id}/move`).auth(token, { type: 'bearer' }).send(body);

/** This project's cards in the column, top to bottom. */
const column = async (status = 'IN_REVIEW') => {
  const tasks = await prisma.task.findMany({
    where: { projectId, status: status as never },
    orderBy: { order: 'asc' },
    select: { title: true },
  });
  return tasks.map((t) => t.title).join('');
};

describe('reorder cards in a column', () => {
  it('adds new cards to the bottom of the column', async () => {
    expect(await column()).toBe('ABC');
  });

  it('moves a card to the top, between two cards and to the bottom', async () => {
    expect(
      (await move(ids.C, { status: 'IN_REVIEW', afterId: null, beforeId: ids.A })).status,
    ).toBe(200);
    expect(await column()).toBe('CAB');
    expect(
      (await move(ids.B, { status: 'IN_REVIEW', afterId: ids.C, beforeId: ids.A })).status,
    ).toBe(200);
    expect(await column()).toBe('CBA');
    expect(
      (await move(ids.C, { status: 'IN_REVIEW', afterId: ids.A, beforeId: null })).status,
    ).toBe(200);
    expect(await column()).toBe('BAC');
  });

  it('renumbers the column when the neighbours have no room between them', async () => {
    await prisma.task.update({ where: { id: ids.B }, data: { order: 7000 } });
    await prisma.task.update({ where: { id: ids.A }, data: { order: 7001 } });
    const res = await move(ids.C, { status: 'IN_REVIEW', afterId: ids.B, beforeId: ids.A });
    expect(res.status).toBe(200);
    expect(await column()).toBe('BCA');
  });

  it('places a card from another column between cards there', async () => {
    const res = await move(ids.A, { status: 'BLOCKED', afterId: null, beforeId: null });
    expect(res.status).toBe(200);
    expect((await move(ids.B, { status: 'BLOCKED', afterId: null, beforeId: ids.A })).status).toBe(
      200,
    );
    expect(await column('BLOCKED')).toBe('BA');
    expect(await column()).toBe('C');
  });

  it('refuses neighbours from a different column', async () => {
    const res = await move(ids.C, { status: 'IN_REVIEW', afterId: ids.A, beforeId: null });
    expect(res.status).toBe(400);
  });

  it('still accepts an explicit order', async () => {
    expect((await move(ids.C, { status: 'IN_REVIEW', order: 123 })).status).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ids.C } })).order).toBe(123);
  });
});
