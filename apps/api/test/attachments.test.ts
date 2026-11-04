import { existsSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/prisma.js';
import { signToken } from '../src/middleware/auth.js';

// Task attachments (M4 JIRA-lite): files on disk, permissions as for links, safe downloads.
// vitest.config.ts sets MAX_UPLOAD_MB=1 and a temporary UPLOAD_DIR.
const app = createApp();
const CODE = `AT${Date.now().toString(36).slice(-5).toUpperCase()}`;
const EMAILS = ['assignee', 'viewer', 'outsider'].map(
  (who) => `attach.${who}.${CODE.toLowerCase()}@resourceboard.local`,
);
let admin: string;
const tokens: Record<'assignee' | 'viewer' | 'outsider', string> = {
  assignee: '',
  viewer: '',
  outsider: '',
};
let projectId: string;
let taskId: string;
let otherTaskId: string;

const upload = (token: string, task: string, name: string, body: Buffer | string, type?: string) =>
  request(app)
    .post(`/api/tasks/${task}/attachments`)
    .query({ name })
    .auth(token, { type: 'bearer' })
    .set('Content-Type', type ?? 'application/octet-stream')
    .send(body);
const get = (token: string, url: string) => request(app).get(url).auth(token, { type: 'bearer' });
const del = (token: string, url: string) =>
  request(app).delete(url).auth(token, { type: 'bearer' });
const storedPath = async (id: string) =>
  path.join(
    config.UPLOAD_DIR,
    (await prisma.attachment.findUniqueOrThrow({ where: { id } })).storageKey,
  );

beforeAll(async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@resourceboard.local', password: 'Admin@12345' });
  admin = login.body.token;
  projectId = (
    await request(app)
      .post('/api/projects')
      .auth(admin, { type: 'bearer' })
      .send({ code: CODE, name: `Attachments ${CODE}` })
  ).body.id;
  const people = await Promise.all(
    EMAILS.map((email, i) =>
      prisma.person.create({ data: { name: `Attach ${i}`, email, role: 'MEMBER' } }),
    ),
  );
  // The assignee and the viewer are on the project; the outsider is not.
  await prisma.projectMember.createMany({
    data: people.slice(0, 2).map((p) => ({ projectId, personId: p.id })),
  });
  (['assignee', 'viewer', 'outsider'] as const).forEach((who, i) => {
    tokens[who] = signToken({ id: people[i].id, email: people[i].email, role: 'MEMBER' });
  });
  const create = (title: string, assigneeId?: string) =>
    request(app)
      .post('/api/tasks')
      .auth(admin, { type: 'bearer' })
      .send({ projectId, title, assigneeId });
  taskId = (await create('With files', people[0].id)).body.id;
  otherTaskId = (await create('Also with files')).body.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Task', entityId: { in: [taskId, otherTaskId] } },
  });
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { code: CODE } });
  await prisma.person.deleteMany({ where: { email: { in: EMAILS } } });
});

describe('task attachments', () => {
  let reportId: string;

  it('uploads a file as the raw body and lists it with the uploader', async () => {
    const res = await upload(
      tokens.assignee,
      taskId,
      'Q3 report.pdf',
      '%PDF-1.4 fake',
      'application/pdf',
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Q3 report.pdf',
      mimeType: 'application/pdf',
      size: 13,
    });
    expect(res.body.uploader.name).toBe('Attach 0');
    reportId = res.body.id;
    expect(existsSync(await storedPath(reportId))).toBe(true);

    const list = await get(tokens.viewer, `/api/tasks/${taskId}/attachments`);
    expect(list.status).toBe(200);
    expect(list.body.maxBytes).toBe(1024 * 1024);
    expect(list.body.attachments.map((a: { name: string }) => a.name)).toEqual(['Q3 report.pdf']);
  });

  it('downloads as an attachment, never inline', async () => {
    const res = await get(tokens.viewer, `/api/attachments/${reportId}`).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Q3 report.pdf"/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.from(res.body).toString()).toBe('%PDF-1.4 fake');
  });

  it('keeps the original name but stores the file under a generated key', async () => {
    const res = await upload(admin, taskId, '../../etc/pass\u0007wd.txt', 'hello', 'text/plain');
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('pass_wd.txt');
    const stored = await storedPath(res.body.id);
    expect(path.dirname(stored)).toBe(config.UPLOAD_DIR);
    expect(path.basename(stored)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts a .json file without the JSON parser touching it', async () => {
    const res = await upload(admin, taskId, 'data.json', '{"a":1}', 'application/json');
    expect(res.status).toBe(201);
    expect(res.body.size).toBe(7);
  });

  it('refuses files over the limit, empty files, and programs or web pages', async () => {
    const big = await upload(admin, taskId, 'big.bin', Buffer.alloc(1024 * 1024 + 1));
    expect(big.status).toBe(413);
    expect(big.body.error).toMatch(/up to 1 MB/);
    expect((await upload(admin, taskId, 'empty.txt', '')).status).toBe(400);
    for (const [name, type] of [
      ['setup.exe', 'application/octet-stream'],
      ['run.sh', 'text/plain'],
      ['page.html', 'text/html'],
      ['logo.svg', 'image/svg+xml'],
      ['innocent.png', 'text/html'],
    ]) {
      const res = await upload(admin, taskId, name, 'x', type);
      expect(res.status, name).toBe(415);
    }
    expect((await upload(admin, taskId, '', 'x')).status).toBe(400);
  });

  it('lets only managers and the assignee upload, and hides other projects', async () => {
    expect((await upload(tokens.viewer, taskId, 'notes.txt', 'x')).status).toBe(403);
    // Not the assignee of this task.
    expect((await upload(tokens.assignee, otherTaskId, 'notes.txt', 'x')).status).toBe(403);
    // Not on the project: the task, its list and its files are hidden.
    expect((await upload(tokens.outsider, taskId, 'notes.txt', 'x')).status).toBe(404);
    expect((await get(tokens.outsider, `/api/tasks/${taskId}/attachments`)).status).toBe(404);
    expect((await get(tokens.outsider, `/api/attachments/${reportId}`)).status).toBe(404);
  });

  it('records added and removed files in the task history', async () => {
    const history = (await get(admin, `/api/tasks/${taskId}/history`)).body as {
      action: string;
      attachment: string | null;
    }[];
    expect(history.find((h) => h.action === 'attach')?.attachment).toBeTruthy();
  });

  it('lets the uploader or a manager delete a file, and removes it from disk', async () => {
    const file = await storedPath(reportId);
    expect((await del(tokens.viewer, `/api/attachments/${reportId}`)).status).toBe(403);
    expect((await del(tokens.assignee, `/api/attachments/${reportId}`)).status).toBe(204);
    expect(existsSync(file)).toBe(false);
    expect((await get(admin, `/api/attachments/${reportId}`)).status).toBe(404);
    const [latest] = (await get(admin, `/api/tasks/${taskId}/history`)).body;
    expect(latest).toMatchObject({ action: 'detach', attachment: 'Q3 report.pdf' });

    const byAssignee = (await upload(tokens.assignee, taskId, 'b.txt', 'b')).body.id;
    expect((await del(admin, `/api/attachments/${byAssignee}`)).status).toBe(204);
  });

  it('deletes the files of a deleted task', async () => {
    const id = (await upload(admin, otherTaskId, 'gone.txt', 'bye')).body.id;
    const file = await storedPath(id);
    expect((await del(admin, `/api/tasks/${otherTaskId}`)).status).toBe(204);
    expect(existsSync(file)).toBe(false);
    expect(await prisma.attachment.count({ where: { id } })).toBe(0);
  });
});
