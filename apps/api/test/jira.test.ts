import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  adfToText,
  fromTask,
  priorityFromJira,
  statusFromJira,
  textToAdf,
  toIssueFields,
} from '../src/modules/jira/jira.mapping.js';
import { syncProject } from '../src/modules/jira/jira.sync.js';
import { FakeJira } from './jira.fake.js';

// JIRA two-way sync (M3-02) and edits made on both sides (M3-03), against an in-memory JIRA.
const app = createApp();
const TAG = Date.now().toString(36);
const CODE = `JS${TAG.slice(-5).toUpperCase()}`;
const JKEY = `J${TAG.slice(-4).toUpperCase()}`;
let admin: string;
let projectId: string;
let liamId: string;
let outsiderId: string;
let jira: FakeJira;

const tick = () => new Promise((r) => setTimeout(r, 15));
const as = () => ({
  post: (url: string, body: object) =>
    request(app).post(url).auth(admin, { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(admin, { type: 'bearer' }).send(body),
  get: (url: string) => request(app).get(url).auth(admin, { type: 'bearer' }),
});
const sync = () => syncProject(projectId, jira);
const taskByIssue = (key: string) => prisma.task.findUniqueOrThrow({ where: { jiraKey: key } });

beforeAll(async () => {
  admin = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' })
  ).body.token;
  const person = async (n: string) =>
    (
      await as().post('/api/people', {
        name: `Jira ${n} ${TAG}`,
        email: `jira-${n}-${TAG}@example.test`,
        password: 'Start1234',
      })
    ).body.id as string;
  liamId = await person('liam');
  outsiderId = await person('outsider');
  projectId = (await as().post('/api/projects', { code: CODE, name: `Jira ${CODE}` })).body.id;
  await request(app)
    .put(`/api/projects/${projectId}/members`)
    .auth(admin, { type: 'bearer' })
    .send({ personIds: [liamId] });
  jira = new FakeJira(JKEY);
  jira.users.push(
    { accountId: 'acc-liam', displayName: 'Liam', emailAddress: `jira-liam-${TAG}@example.test` },
    { accountId: 'acc-ext', displayName: 'Contractor' },
  );
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      entityId: { in: (await prisma.task.findMany({ where: { projectId } })).map((t) => t.id) },
    },
  });
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.person.deleteMany({ where: { id: { in: [liamId, outsiderId] } } });
});

describe('JIRA field mapping', () => {
  it('turns JIRA rich text into plain text and back', () => {
    const adf = textToAdf('First line\n\nSecond line');
    expect(adfToText(adf)).toBe('First line\n\nSecond line');
    expect(
      adfToText({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Steps:' }] },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
              },
            ],
          },
        ],
      }),
    ).toBe('Steps:\n- one\n- two');
    expect(textToAdf('  ')).toBeNull();
  });

  it('maps statuses by name, then by category, and priorities', () => {
    expect(statusFromJira({ name: 'In Review' })).toBe('IN_REVIEW');
    expect(statusFromJira({ name: 'Closed' })).toBe('DONE');
    expect(
      statusFromJira({ name: 'Waiting for customer', statusCategory: { key: 'indeterminate' } }),
    ).toBe('IN_PROGRESS');
    expect(statusFromJira({ name: 'Triage', statusCategory: { key: 'new' } })).toBe('TODO');
    expect(priorityFromJira({ name: 'Highest' })).toBe('CRITICAL');
    expect(priorityFromJira(null)).toBe('MEDIUM');
  });

  it('writes estimates in minutes and leaves an unknown assignee out', () => {
    const v = fromTask({
      title: 'x',
      description: null,
      status: 'TODO',
      priority: 'HIGH',
      type: 'SUPPORT',
      assigneeId: 'p1',
      dueDate: new Date('2026-12-01T00:00:00Z'),
      labels: ['Front End', 'api'],
      estimateHours: 1.5,
    });
    expect(v.labels).toEqual(['api', 'front-end']);
    const fields = toIssueFields(v, () => undefined);
    expect(fields).toMatchObject({
      priority: { name: 'High' },
      issuetype: { name: 'Task' },
      duedate: '2026-12-01',
      timetracking: { originalEstimate: '90m' },
    });
    expect(fields).not.toHaveProperty('assignee');
  });
});

describe('two-way sync', () => {
  it('links a project to its JIRA project from Settings', async () => {
    const res = await as().patch(`/api/projects/${projectId}`, { jiraKey: JKEY.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body.jiraKey).toBe(JKEY);
    expect((await as().patch(`/api/projects/${projectId}`, { jiraKey: 'not a key' })).status).toBe(
      400,
    );
  });

  it('first sync: JIRA issues become tasks and tasks become issues', async () => {
    jira.add({
      summary: 'Login page',
      description: textToAdf('Build the login page'),
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      priority: { name: 'High' },
      issuetype: { name: 'Story' },
      assignee: jira.users[0],
      duedate: '2031-01-15',
      labels: ['Frontend'],
      timetracking: { originalEstimateSeconds: 8 * 3600 },
    });
    const local = await as().post('/api/tasks', {
      projectId,
      title: 'Write release notes',
      status: 'IN_REVIEW',
      priority: 'LOW',
      assigneeId: liamId,
      estimateHours: 2,
    });
    expect(local.status).toBe(201);

    const run = await sync();
    expect(run).toMatchObject({ ok: true, pulled: 1, pushed: 1, conflicts: 0, error: null });

    // From JIRA: every field, and the assignee matched by email (now remembered on the person).
    const pulled = await taskByIssue(`${JKEY}-1`);
    expect(pulled).toMatchObject({
      projectId,
      title: 'Login page',
      description: 'Build the login page',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      type: 'STORY',
      assigneeId: liamId,
      labels: ['frontend'],
    });
    expect(Number(pulled.estimateHours)).toBe(8);
    expect(pulled.dueDate?.toISOString().slice(0, 10)).toBe('2031-01-15');
    expect((await prisma.person.findUnique({ where: { id: liamId } }))?.jiraAccountId).toBe(
      'acc-liam',
    );

    // To JIRA: a new issue, moved to the matching status.
    const pushedTask = await prisma.task.findUniqueOrThrow({ where: { id: local.body.id } });
    expect(pushedTask.jiraKey).toBe(`${JKEY}-2`);
    const issue = jira.issues.get(`${JKEY}-2`)!.fields;
    expect(issue).toMatchObject({
      summary: 'Write release notes',
      status: { name: 'In Review' },
      priority: { name: 'Low' },
      assignee: { accountId: 'acc-liam' },
      timetracking: { originalEstimateSeconds: 7200 },
    });

    // Nothing changed since: the next run does nothing.
    expect(await sync()).toMatchObject({ ok: true, pulled: 0, pushed: 0, conflicts: 0 });
  });

  it('copies a change made only in JIRA, and shows it as the JIRA sync in history', async () => {
    await tick();
    jira.edit(`${JKEY}-1`, { summary: 'Login and sign-up pages' });
    jira.setStatus(`${JKEY}-1`, 'Done');
    expect(await sync()).toMatchObject({ pulled: 1, pushed: 0, conflicts: 0 });
    const task = await taskByIssue(`${JKEY}-1`);
    expect(task).toMatchObject({ title: 'Login and sign-up pages', status: 'DONE' });
    expect(task.completedAt).not.toBeNull();
    const history = await as().get(`/api/tasks/${task.id}/history`);
    expect(history.body[0]).toMatchObject({ action: 'update', actor: { name: 'JIRA sync' } });
  });

  it('copies a change made only in SedHub', async () => {
    await tick();
    const task = await taskByIssue(`${JKEY}-2`);
    await as().patch(`/api/tasks/${task.id}`, {
      priority: 'CRITICAL',
      status: 'DONE',
      labels: ['docs'],
      description: 'For 2.0',
    });
    expect(await sync()).toMatchObject({ pulled: 0, pushed: 1, conflicts: 0 });
    expect(jira.issues.get(`${JKEY}-2`)!.fields).toMatchObject({
      priority: { name: 'Highest' },
      status: { name: 'Done' },
      labels: ['docs'],
    });
    expect(adfToText(jira.issues.get(`${JKEY}-2`)!.fields.description)).toBe('For 2.0');
  });

  it('merges different fields changed on each side without a conflict', async () => {
    await tick();
    const task = await taskByIssue(`${JKEY}-2`);
    await as().patch(`/api/tasks/${task.id}`, { title: 'Release notes for 2.0' });
    await tick();
    jira.edit(`${JKEY}-2`, { duedate: '2031-02-01' });
    expect(await sync()).toMatchObject({ pulled: 1, pushed: 1, conflicts: 0 });
    expect(jira.issues.get(`${JKEY}-2`)!.fields.summary).toBe('Release notes for 2.0');
    expect((await taskByIssue(`${JKEY}-2`)).dueDate?.toISOString().slice(0, 10)).toBe('2031-02-01');
  });

  it('on the same field changed on both sides, keeps the most recent edit and reports it', async () => {
    const task = await taskByIssue(`${JKEY}-2`);
    await tick();
    await as().patch(`/api/tasks/${task.id}`, { title: 'SedHub title' });
    await tick();
    jira.edit(`${JKEY}-2`, { summary: 'JIRA title' });
    const run = await sync();
    expect(run).toMatchObject({ ok: true, conflicts: 1 });
    expect(run.details).toEqual([
      expect.objectContaining({
        kind: 'conflict',
        field: 'Summary',
        kept: 'jira',
        jira: 'JIRA title',
        sedhub: 'SedHub title',
        issue: `${JKEY}-2`,
      }),
    ]);
    expect((await taskByIssue(`${JKEY}-2`)).title).toBe('JIRA title');

    // The other way round: SedHub edited last wins.
    await tick();
    jira.edit(`${JKEY}-2`, { summary: 'JIRA again' });
    await tick();
    await as().patch(`/api/tasks/${task.id}`, { title: 'SedHub last' });
    const second = await sync();
    expect(second.details).toEqual([expect.objectContaining({ kind: 'conflict', kept: 'sedhub' })]);
    expect(jira.issues.get(`${JKEY}-2`)!.fields.summary).toBe('SedHub last');

    // Conflicts are in the audit log for admins.
    const audit = await as().get('/api/audit?area=jira&limit=200');
    const mine = audit.body.entries.filter((e: { entityId: string }) => e.entityId === task.id);
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ action: 'jira.conflict', actor: { name: 'JIRA sync' } });
  });

  it('keeps going when JIRA refuses a field or a status, and says why', async () => {
    jira.timeTracking = false;
    jira.unreachable.add('In Review');
    const task = await taskByIssue(`${JKEY}-2`);
    await tick();
    await as().patch(`/api/tasks/${task.id}`, {
      estimateHours: 5,
      status: 'IN_REVIEW',
      title: 'Still syncs',
    });
    const run = await sync();
    expect(run.ok).toBe(true);
    const messages = (run.details as { message?: string }[]).map((d) => d.message ?? '');
    expect(messages.some((m) => m.startsWith('JIRA refused timetracking'))).toBe(true);
    expect(messages.some((m) => m.startsWith('No JIRA transition'))).toBe(true);
    expect(jira.issues.get(`${JKEY}-2`)!.fields.summary).toBe('Still syncs');
    // SedHub keeps its own values.
    expect(await taskByIssue(`${JKEY}-2`)).toMatchObject({ status: 'IN_REVIEW' });
    jira.timeTracking = true;
    jira.unreachable.clear();
  });

  it('leaves a JIRA assignee with no SedHub match unassigned here, without clearing JIRA', async () => {
    await tick();
    jira.edit(`${JKEY}-1`, { assignee: jira.users[1] });
    await sync();
    const task = await taskByIssue(`${JKEY}-1`);
    expect(task.assigneeId).toBeNull();
    await tick();
    await as().patch(`/api/tasks/${task.id}`, { priority: 'LOW' });
    await sync();
    expect(jira.issues.get(`${JKEY}-1`)!.fields.assignee?.accountId).toBe('acc-ext');
    expect(jira.issues.get(`${JKEY}-1`)!.fields.priority?.name).toBe('Low');
  });

  it('records a failed run with the error', async () => {
    const broken = new FakeJira(JKEY);
    broken.searchIssues = async () => {
      throw new Error('JIRA is down');
    };
    const run = await syncProject(projectId, broken);
    expect(run).toMatchObject({ ok: false, error: 'JIRA is down' });
    const status = await as().get(`/api/jira/projects/${projectId}`);
    expect(status.body).toMatchObject({ jiraKey: JKEY, configured: false });
    expect(status.body.runs[0]).toMatchObject({ ok: false, error: 'JIRA is down' });
  });

  it('Sync now needs JIRA to be connected and someone who manages the project', async () => {
    const res = await as().post(`/api/jira/projects/${projectId}/sync`, {});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('JIRA isn’t connected');
    await prisma.person.update({ where: { id: liamId }, data: { mustChangePassword: false } });
    const member = (
      await request(app)
        .post('/api/auth/login')
        .send({ email: `jira-liam-${TAG}@example.test`, password: 'Start1234' })
    ).body.token;
    const denied = await request(app)
      .post(`/api/jira/projects/${projectId}/sync`)
      .auth(member, { type: 'bearer' });
    expect(denied.status).toBe(403);
  });
});
