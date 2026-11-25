import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { forecastOf } from '../src/modules/portfolio/forecast.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
// Wednesday 18 Nov 2026.
const NOW = d('2026-11-18');
const open = (due: string | null) => ({
  done: false,
  dueDate: due ? d(due) : null,
  completedAt: null,
});
const done = (at: string) => ({ done: true, dueDate: null, completedAt: d(at) });

describe('forecastOf', () => {
  it('is on time when open work ends before the promise, with working days spare', () => {
    // Finish Fri 20 Nov, promised Tue 24 Nov: Mon 23 and Tue 24 spare.
    const f = forecastOf([open('2026-11-20'), open('2026-11-19')], d('2026-11-24'), NOW);
    expect(f).toEqual({
      state: 'on_time',
      promised: '2026-11-24',
      finish: '2026-11-20',
      daysLate: -2,
      unscheduled: 0,
    });
  });

  it('is late when open work ends after the promise, counting working days only', () => {
    // Promised Fri 20 Nov, finish Tue 24 Nov: Mon 23 and Tue 24 late.
    const f = forecastOf([open('2026-11-24'), done('2026-11-10')], d('2026-11-20'), NOW);
    expect([f.state, f.finish, f.daysLate]).toEqual(['late', '2026-11-24', 2]);
  });

  it('counts an overdue open task as finishing today', () => {
    const f = forecastOf([open('2026-11-02')], d('2026-11-17'), NOW);
    expect([f.state, f.finish, f.daysLate]).toEqual(['late', '2026-11-18', 1]);
  });

  it('counts open tasks without a due date as unscheduled', () => {
    const f = forecastOf([open(null), open('2026-11-19'), open(null)], d('2026-11-30'), NOW);
    expect([f.state, f.unscheduled]).toEqual(['on_time', 2]);
    expect(forecastOf([open(null)], d('2026-11-30'), NOW).state).toBe('no_plan');
  });

  it('needs a promised date to judge lateness', () => {
    const f = forecastOf([open('2026-11-19')], null, NOW);
    expect([f.state, f.finish, f.daysLate]).toEqual(['no_promise', '2026-11-19', null]);
  });

  it('is done when every task is done, finishing on the last completion', () => {
    const f = forecastOf([done('2026-11-03'), done('2026-11-05')], d('2026-11-04'), NOW);
    expect([f.state, f.finish, f.daysLate]).toEqual(['done', '2026-11-05', 1]);
  });
});

// GET /api/portfolio
const app = createApp();
const TAG = Date.now().toString(36).toUpperCase();
let token: string;
let personId: string;
let teamId: string;
const projectIds: string[] = [];

beforeAll(async () => {
  token = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' })
  ).body.token;
  personId = (
    await request(app)
      .post('/api/people')
      .auth(token, { type: 'bearer' })
      .send({
        name: `Portfolio ${TAG}`,
        email: `portfolio-${TAG}@example.test`,
        password: 'Start1234',
      })
  ).body.id;
  teamId = (await prisma.team.create({ data: { name: `Portfolio team ${TAG}` } })).id;
  await prisma.teamMember.create({ data: { teamId, personId } });

  const today = new Date();
  const inDays = (n: number) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + n));
  // LATE: promised in 2 days, work due in 20; the team's person has a task on it.
  const late = await prisma.project.create({
    data: {
      code: `PL${TAG}`.slice(0, 10),
      name: 'Portfolio late',
      status: 'ACTIVE',
      endDate: inDays(2),
    },
  });
  // DONE: completed project, left out unless closed projects are asked for.
  const closed = await prisma.project.create({
    data: { code: `PC${TAG}`.slice(0, 10), name: 'Portfolio closed', status: 'COMPLETED' },
  });
  projectIds.push(late.id, closed.id);
  await prisma.task.createMany({
    data: [
      {
        projectId: late.id,
        number: 1,
        title: 'Build',
        status: 'IN_PROGRESS',
        estimateHours: 30,
        dueDate: inDays(20),
        assigneeId: personId,
      },
      {
        projectId: late.id,
        number: 2,
        title: 'Spec',
        status: 'DONE',
        estimateHours: 10,
        completedAt: inDays(-3),
      },
      { projectId: late.id, number: 3, title: 'Later', status: 'BACKLOG' },
    ],
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.team.deleteMany({ where: { id: teamId } });
  await prisma.person.deleteMany({ where: { id: personId } });
});

const get = (q = '') => request(app).get(`/api/portfolio${q}`).auth(token, { type: 'bearer' });

describe('GET /api/portfolio', () => {
  it('lists open projects with lead, progress, health and forecast', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const row = res.body.projects.find(
      (r: { project: { id: string } }) => r.project.id === projectIds[0],
    );
    expect(row.progress).toMatchObject({
      tasks: 3,
      done: 1,
      open: 2,
      estimateHours: 40,
      doneHours: 10,
      remainingHours: 30,
    });
    expect(row.forecast).toMatchObject({ state: 'late', unscheduled: 1 });
    expect(row.forecast.daysLate).toBeGreaterThan(0);
    expect(row.health.rag).toBe('green');
    const codes = res.body.projects.map((r: { project: { id: string } }) => r.project.id);
    expect(codes).not.toContain(projectIds[1]);
    expect(res.body.totals.late).toBeGreaterThanOrEqual(1);
  });

  it('includes closed projects when asked', async () => {
    const ids = (await get('?includeClosed=true')).body.projects.map(
      (r: { project: { id: string } }) => r.project.id,
    );
    expect(ids).toContain(projectIds[1]);
  });

  it('filters to the projects a team works on', async () => {
    const res = await get(`?teamId=${teamId}`);
    expect(res.body.projects.map((r: { project: { id: string } }) => r.project.id)).toEqual([
      projectIds[0],
    ]);
  });
});
