import { Router } from 'express';
import { z } from 'zod';
import { TaskPriority, TaskStatus, TaskType } from '../../generated/prisma/enums.js';
import { parse } from '../../lib/http.js';
import { visibleProjectIds } from '../../lib/visibility.js';
import { requireAuth } from '../../middleware/auth.js';
import * as comments from './comments.service.js';
import * as service from './tasks.service.js';

const listQuery = z.object({
  projectId: z.string().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(TaskStatus).optional(),
  sprintId: z.string().optional(),
  epicId: z.string().optional(),
});

// Either an explicit order, or the neighbouring cards it was dropped between.
const moveBody = z.object({
  status: z.enum(TaskStatus),
  order: z.number().int().optional(),
  afterId: z.string().min(1).nullable().optional(),
  beforeId: z.string().min(1).nullable().optional(),
});

const optionalDate = z.coerce.date().nullable().optional();

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

export const tasksRouter = Router();

tasksRouter.get('/', async (req, res) => {
  const projectIds = await visibleProjectIds(req.user!);
  const scope = projectIds && { projectIds, personId: req.user!.id };
  res.json(await service.listTasks(parse(listQuery, req.query), scope));
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
