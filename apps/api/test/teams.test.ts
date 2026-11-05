import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Creating and editing teams and their membership (M1-18).
const app = createApp();
const TAG = Date.now().toString(36);
const NAME = `Team ${TAG}`;
let token: string;
let memberToken: string;
const people: string[] = [];

const as = (t = () => token) => ({
  get: (url: string) => request(app).get(url).auth(t(), { type: 'bearer' }),
  post: (url: string, body: object) =>
    request(app).post(url).auth(t(), { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(t(), { type: 'bearer' }).send(body),
  delete: (url: string) => request(app).delete(url).auth(t(), { type: 'bearer' }),
});

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  token = login.body.token;
  for (const n of ['a', 'b', 'c']) {
    const res = await as().post('/api/people', {
      name: `Teams ${n} ${TAG}`,
      email: `teams-${n}-${TAG}@example.test`,
      password: 'Start1234',
    });
    people.push(res.body.id);
  }
  // Sign in as one of them (a team member) to check write access.
  await prisma.person.update({ where: { id: people[2] }, data: { mustChangePassword: false } });
  memberToken = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: `teams-c-${TAG}@example.test`, password: 'Start1234' })
  ).body.token;
});

afterAll(async () => {
  await prisma.team.deleteMany({ where: { name: { contains: TAG } } });
  await prisma.person.deleteMany({ where: { id: { in: people } } });
});

describe('teams', () => {
  let id: string;

  it('creates a team with members and a lead', async () => {
    const res = await as().post('/api/teams', {
      name: ` ${NAME} `,
      description: 'Platform work',
      members: [{ personId: people[0], isLead: true }, { personId: people[1] }],
    });
    expect(res.status).toBe(201);
    id = res.body.id;
    expect(res.body.name).toBe(NAME);
    expect(
      res.body.members.map((m: { person: { id: string }; isLead: boolean }) => [
        m.person.id,
        m.isLead,
      ]),
    ).toEqual([
      [people[0], true],
      [people[1], false],
    ]);
  });

  it('refuses a duplicate name, an unknown person and a person listed twice', async () => {
    const dup = await as().post('/api/teams', { name: NAME });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('A team with that name already exists');
    expect(
      (await as().post('/api/teams', { name: `${NAME} x`, members: [{ personId: 'nope' }] }))
        .status,
    ).toBe(400);
    expect(
      (
        await as().post('/api/teams', {
          name: `${NAME} y`,
          members: [{ personId: people[0] }, { personId: people[0] }],
        })
      ).status,
    ).toBe(400);
  });

  it('renames and replaces the membership, keeping existing members', async () => {
    const before = await prisma.teamMember.findUniqueOrThrow({
      where: { teamId_personId: { teamId: id, personId: people[1] } },
    });
    const res = await as().patch(`/api/teams/${id}`, {
      name: `${NAME} renamed`,
      members: [
        { personId: people[1], isLead: true },
        { personId: people[2], isLead: false },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`${NAME} renamed`);
    expect(res.body.description).toBe('Platform work');
    expect(res.body.members.map((m: { person: { id: string } }) => m.person.id)).toEqual([
      people[1],
      people[2],
    ]);
    const after = await prisma.teamMember.findUniqueOrThrow({
      where: { teamId_personId: { teamId: id, personId: people[1] } },
    });
    expect(after.joinedAt).toEqual(before.joinedAt);
    expect(after.isLead).toBe(true);
  });

  it('lets only staffing roles change teams; members see their own teams', async () => {
    const member = as(() => memberToken);
    expect((await member.post('/api/teams', { name: `${NAME} m` })).status).toBe(403);
    expect((await member.patch(`/api/teams/${id}`, { name: 'x' })).status).toBe(403);
    expect((await member.delete(`/api/teams/${id}`)).status).toBe(403);
    const mine = await member.get('/api/teams');
    expect(mine.body.map((t: { id: string }) => t.id)).toEqual([id]);
  });

  it('deletes a team without touching the people', async () => {
    expect((await as().delete(`/api/teams/${id}`)).status).toBe(204);
    expect((await as().delete(`/api/teams/${id}`)).status).toBe(404);
    expect(await prisma.person.count({ where: { id: { in: people } } })).toBe(3);
  });
});
