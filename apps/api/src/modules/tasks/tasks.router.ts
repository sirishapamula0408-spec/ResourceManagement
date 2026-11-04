import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { TaskPriority, TaskStatus, TaskType } from '../../generated/prisma/enums.js';
import { HttpError, parse } from '../../lib/http.js';
import { visibleProjectIds } from '../../lib/visibility.js';
import { requireAuth, type AuthUser } from '../../middleware/auth.js';
import * as attachments from './attachments.service.js';
import * as comments from './comments.service.js';
import * as history from './history.service.js';
import * as links from './links.service.js';
import * as service from './tasks.service.js';

const listQuery = z.object({
  projectId: z.string().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(TaskStatus).optional(),
  sprintId: z.string().optional(),
  epicId: z.string().optional(),
  label: z.string().optional(),
});

// Either an explicit order, or the neighbouring cards it was dropped between.
const moveBody = z.object({
  status: z.enum(TaskStatus),
  order: z.number().int().optional(),
  afterId: z.string().min(1).nullable().optional(),
  beforeId: z.string().min(1).nullable().optional(),
});

const optionalDate = z.coerce.date().nullable().optional();

/** A label is one lowercase word: spaces become dashes, as in JIRA ("Customer request" → "customer-request"). */
const label = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/\s+/g, '-'))
  .pipe(z.string().min(1).max(30, 'Keep labels to 30 characters'));

const taskFields = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, 'Add a summary').max(200),
  description: z.string().nullable().optional(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  type: z.enum(TaskType).optional(),
  assigneeId: z.string().nullable().optional(),
  estimateHours: z.number().min(0).max(1000).nullable().optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
  sprintId: z.string().min(1).nullable().optional(),
  epicId: z.string().min(1).nullable().optional(),
  labels: z.array(label).max(10, 'Use at most 10 labels').optional(),
  parentId: z.string().min(1).nullable().optional(),
});

// Scope plan: due date cannot be before start.
const datesInOrder = (t: { startDate?: Date | null; dueDate?: Date | null }) =>
  !t.startDate || !t.dueDate || t.dueDate >= t.startDate;
const datesMessage = { message: 'Due date cannot be before the start date', path: ['dueDate'] };

const createBody = taskFields.refine(datesInOrder, datesMessage);
const updateBody = taskFields.partial().refine(datesInOrder, datesMessage);

// Bulk delete from the task list; capped so one request stays quick.
const bulkDeleteBody = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Select at least one task').max(500),
});

const worklogBody = z.object({
  hours: z.number().positive().max(24),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().trim().max(500).nullable().optional(),
});

const commentBody = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(5000),
});

const linkBody = z.object({
  kind: z.enum(['BLOCKS', 'BLOCKED_BY', 'RELATES']),
  targetKey: z.string().trim().min(1, 'Enter a task key like ATLAS-12').max(40),
});

const uploadQuery = z.object({
  name: z.string().trim().min(1, 'Name the file: ?name=report.pdf').max(255),
});

/**
 * An attachment arrives as the raw request body (any content type), with its name in ?name=.
 * app.ts keeps the JSON parser away from this route.
 */
const parseRaw = express.raw({ type: () => true, limit: attachments.maxUploadBytes() });
const rawUpload: RequestHandler = (req, res, next) =>
  parseRaw(req, res, (err?: unknown) => {
    if ((err as { type?: string } | undefined)?.type === 'entity.too.large') {
      const mb = Number((attachments.maxUploadBytes() / 1024 / 1024).toFixed(1));
      return next(new HttpError(413, `The file is too big: files can be up to ${mb} MB`));
    }
    next(err);
  });

export const tasksRouter = Router();

/** A team member's view: their projects' tasks and their own (null = everything). */
const scopeOf = async (user: AuthUser | undefined) => {
  const projectIds = await visibleProjectIds(user!);
  return projectIds && { projectIds, personId: user!.id };
};

tasksRouter.get('/', async (req, res) => {
  res.json(await service.listTasks(parse(listQuery, req.query), await scopeOf(req.user)));
});

// Labels in use (on the tasks you can see), most used first.
tasksRouter.get('/labels', async (req, res) => {
  res.json(await service.listLabels(await scopeOf(req.user)));
});

// Permission checks live in the service: they depend on the task's project and assignee.
tasksRouter.post('/', requireAuth, async (req, res) => {
  res.status(201).json(await service.createTask(req.user!, parse(createBody, req.body)));
});

tasksRouter.patch('/:id', requireAuth, async (req, res) => {
  const input = parse(updateBody, req.body);
  res.json(await service.updateTask(req.user!, String(req.params.id), input));
});

tasksRouter.post('/bulk-delete', requireAuth, async (req, res) => {
  const { ids } = parse(bulkDeleteBody, req.body);
  res.json(await service.deleteTasks(req.user!, ids));
});

tasksRouter.delete('/:id', requireAuth, async (req, res) => {
  await service.deleteTask(req.user!, String(req.params.id));
  res.status(204).end();
});

tasksRouter.patch('/:id/move', requireAuth, async (req, res) => {
  const { status, ...place } = parse(moveBody, req.body);
  res.json(await service.moveTask(req.user!, String(req.params.id), status, place));
});

tasksRouter.post('/:id/worklogs', requireAuth, async (req, res) => {
  const input = parse(worklogBody, req.body);
  res.status(201).json(await service.logWork(req.user!, String(req.params.id), input));
});

// Comments (M4 JIRA-lite): read and add if you can see the task; edit or delete your own.
tasksRouter.get('/:id/comments', async (req, res) => {
  res.json(await comments.listComments(req.user!, String(req.params.id)));
});

tasksRouter.post('/:id/comments', async (req, res) => {
  const { body } = parse(commentBody, req.body);
  res.status(201).json(await comments.addComment(req.user!, String(req.params.id), body));
});

tasksRouter.patch('/:id/comments/:commentId', async (req, res) => {
  const { body } = parse(commentBody, req.body);
  const { id, commentId } = req.params;
  res.json(await comments.editComment(req.user!, String(id), String(commentId), body));
});

tasksRouter.delete('/:id/comments/:commentId', async (req, res) => {
  const { id, commentId } = req.params;
  await comments.deleteComment(req.user!, String(id), String(commentId));
  res.status(204).end();
});

// Issue links (M4 JIRA-lite): blocks / is blocked by / relates to.
tasksRouter.get('/:id/links', async (req, res) => {
  res.json(await links.listLinks(req.user!, String(req.params.id)));
});

tasksRouter.post('/:id/links', async (req, res) => {
  const input = parse(linkBody, req.body);
  res.status(201).json(await links.addLink(req.user!, String(req.params.id), input));
});

tasksRouter.delete('/:id/links/:linkId', async (req, res) => {
  const { id, linkId } = req.params;
  await links.removeLink(req.user!, String(id), String(linkId));
  res.status(204).end();
});

// Task history (M4 JIRA-lite): who changed what and when, newest first.
tasksRouter.get('/:id/history', async (req, res) => {
  res.json(await history.listHistory(req.user!, String(req.params.id)));
});

// Attachments (M4 JIRA-lite): list and upload here; download and delete at /api/attachments/:id.
tasksRouter.get('/:id/attachments', async (req, res) => {
  res.json(await attachments.listAttachments(req.user!, String(req.params.id)));
});

tasksRouter.post('/:id/attachments', rawUpload, async (req, res) => {
  const { name } = parse(uploadQuery, req.query);
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const file = { name, mimeType: req.get('content-type'), bytes };
  res.status(201).json(await attachments.addAttachment(req.user!, String(req.params.id), file));
});
