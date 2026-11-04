import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

// In-app notifications (M4 JIRA-lite): assignment, comments and status changes, never for
// your own actions.
const app = createApp();
const CODE = `NT${Date.now().toString(36).slice(-5).toUpperCase()}`;
const EMAILS = ['pm', 'ann', 'ben'].map(
  (who) => `notify.${who}.${CODE.toLowerCase()}@resourceboard.local`,
);
let projectId: string;
const ids: Record<'admin' | 'pm' | 'ann' | 'ben', string> = { admin: '', pm: '', ann: '', ben: '' };
const tokens: Record<keyof typeof ids, string> = { admin: '', pm: '', ann: '', ben: '' };

type Item = {
  id: string;
  type: string;
  message: string;
  actor: { name: string } | null;
  task: { id: string; key: string; title: string };
  readAt: string | null;
};

const as = (who: keyof typeof tokens) => ({
  get: (url: string) => request(app).get(url).auth(tokens[who], { type: 'bearer' }),
  post: (url: string, body: object = {}) =>
    request(app).post(url).auth(tokens[who], { type: 'bearer' }).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).auth(tokens[who], { type: 'bearer' }).send(body),
});

/** Someone's notifications about this test's tasks (other test files run alongside). */
async function inbox(who: keyof typeof tokens) {
  return prisma.notification.findMany({
    where: { recipientId: ids[who], task: { projectId } },
    orderBy: { createdAt: 'asc' },
  });
}
const createTask = async (who: keyof typeof tokens, title: string, assignee?: keyof typeof ids) =>
  (
    await as(who).post('/api/tasks', {
      projectId,
      title,
      ...(assignee ? { assigneeId: ids[assignee] } : {}),
    })
  ).body.id as string;

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  tokens.admin = login.body.token;
  ids.admin = login.body.user.id;
  projectId = (await as('admin').post('/api/projects', { code: CODE, name: `Notify ${CODE}` })).body
    .id;
  const people = await Promise.all(
    (['pm', 'ann', 'ben'] as const).map((who, i) =>
      prisma.person.create({
        data: { name: `Notify ${who}`, email: EMAILS[i], role: who === 'pm' ? 'PM' : 'MEMBER' },
      }),
    ),
  );
  await prisma.projectMember.createMany({
    data: people.map((p) => ({ projectId, personId: p.id })),
  });
  (['pm', 'ann', 'ben'] as const).forEach((who, i) => {
    ids[who] = people[i].id;
    tokens[who] = signToken({ id: people[i].id, email: people[i].email, role: people[i].role });
  });
});

afterAll(async () => {
  const tasks = await prisma.task.findMany({ where: { projectId }, select: { id: true } });
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Task', entityId: { in: tasks.map((t) => t.id) } },
  });
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { code: CODE } });
  await prisma.person.deleteMany({ where: { email: { in: EMAILS } } });
});

describe('notifications', () => {
  let taskId: string;

  it('tells the assignee when a task is assigned to them, not the person assigning', async () => {
    taskId = await createTask('pm', 'Write the release notes', 'ann');
    const [n, ...rest] = await inbox('ann');
    expect(rest).toHaveLength(0);
    expect(n).toMatchObject({ type: 'ASSIGNED', actorId: ids.pm, taskId });
    expect(await inbox('pm')).toHaveLength(0);
  });

  it('does not notify you about assigning a task to yourself', async () => {
    const own = await createTask('pm', 'Plan the demo', 'pm');
    expect(await inbox('pm')).toHaveLength(0);
    await as('pm').patch(`/api/tasks/${own}`, { assigneeId: null });
    await as('pm').patch(`/api/tasks/${own}`, { assigneeId: ids.pm });
    expect(await inbox('pm')).toHaveLength(0);
  });

  it('tells the assignee when someone else changes the status (edit or board move)', async () => {
    await as('ann').patch(`/api/tasks/${taskId}`, { status: 'IN_PROGRESS' }); // her own change
    expect(await inbox('ann')).toHaveLength(1);

    await as('pm').patch(`/api/tasks/${taskId}`, { status: 'IN_REVIEW' });
    await as('admin').patch(`/api/tasks/${taskId}/move`, { status: 'DONE' });
    const [, edited, moved] = await inbox('ann');
    expect(edited).toMatchObject({
      type: 'STATUS_CHANGED',
      actorId: ids.pm,
      message: 'changed the status from In progress to In review',
    });
    expect(moved).toMatchObject({
      type: 'STATUS_CHANGED',
      message: expect.stringContaining('to Done'),
    });

    // Saving without a status change, or reordering within a column, says nothing.
    await as('pm').patch(`/api/tasks/${taskId}`, { title: 'Write the release notes (v2)' });
    await as('pm').patch(`/api/tasks/${taskId}/move`, { status: 'DONE', order: 5 });
    expect(await inbox('ann')).toHaveLength(3);
  });

  it('on reassignment tells only the new assignee, once', async () => {
    await as('pm').patch(`/api/tasks/${taskId}`, { assigneeId: ids.ben, status: 'TODO' });
    expect((await inbox('ben')).map((n) => n.type)).toEqual(['ASSIGNED']);
    expect(await inbox('ann')).toHaveLength(3);
  });

  it('tells the assignee and the creator about comments, never the commenter', async () => {
    await as('ben').post(`/api/tasks/${taskId}/comments`, { body: '  Draft is   ready  ' });
    const [comment] = (await inbox('pm')).filter((n) => n.type === 'COMMENTED');
    expect(comment).toMatchObject({ actorId: ids.ben, message: 'commented: “Draft is ready”' });
    expect((await inbox('ben')).filter((n) => n.type === 'COMMENTED')).toHaveLength(0);

    await as('admin').post(`/api/tasks/${taskId}/comments`, { body: 'Looks good' });
    expect((await inbox('pm')).filter((n) => n.type === 'COMMENTED')).toHaveLength(2);
    expect((await inbox('ben')).filter((n) => n.type === 'COMMENTED')).toHaveLength(1);
    expect((await inbox('admin')).filter((n) => n.type === 'COMMENTED')).toHaveLength(0);
  });

  it('lists your own, newest first, with task key, title, actor and unread count', async () => {
    const res = await as('ann').get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(3);
    const items = res.body.items as Item[];
    expect(items.map((i) => i.type)).toEqual(['STATUS_CHANGED', 'STATUS_CHANGED', 'ASSIGNED']);
    expect(items[2]).toMatchObject({
      actor: { name: 'Notify pm' },
      task: { id: taskId, key: `${CODE}-1` },
      readAt: null,
    });
    expect((await as('ann').get('/api/notifications/count')).body).toEqual({ unreadCount: 3 });
  });

  it('marks one or all as read, only your own', async () => {
    const items = (await as('ann').get('/api/notifications')).body.items as Item[];
    expect((await as('ben').post(`/api/notifications/${items[0].id}/read`)).status).toBe(404);
    const read = await as('ann').post(`/api/notifications/${items[0].id}/read`);
    expect(read.body).toEqual({ unreadCount: 2 });
    // Again is fine.
    expect((await as('ann').post(`/api/notifications/${items[0].id}/read`)).status).toBe(200);

    const unread = (await as('ann').get('/api/notifications?unread=1')).body;
    expect(unread.items.map((i: Item) => i.id)).not.toContain(items[0].id);
    expect(unread.items).toHaveLength(2);

    expect((await as('ann').post('/api/notifications/read-all')).body).toEqual({ unreadCount: 0 });
    expect((await as('ann').get('/api/notifications?unread=1')).body.items).toHaveLength(0);
    // Ben's are untouched.
    expect((await as('ben').get('/api/notifications/count')).body.unreadCount).toBeGreaterThan(0);
  });

  it('hides notifications about tasks a team member can no longer see', async () => {
    await prisma.projectMember.delete({
      where: { projectId_personId: { projectId, personId: ids.ann } },
    });
    expect((await as('ann').get('/api/notifications')).body.items).toHaveLength(0);
    await prisma.projectMember.create({ data: { projectId, personId: ids.ann } });
  });
});
