import { Router } from 'express';
import { z } from 'zod';
import { TaskPriority, TaskStatus, TaskType } from '../../generated/prisma/enums.js';
import { parse } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import * as service from './tasks.service.js';

const listQuery = z.object({
  projectId: z.string().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(TaskStatus).optional(),
});

const moveBody = z.object({
  status: z.enum(TaskStatus),
  order: z.number().int(),
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
});

// Scope plan: due date cannot be before start.
const datesInOrder = (t: { startDate?: Date | null; dueDate?: Date | null }) =>
  !t.startDate || !t.dueDate || t.dueDate >= t.startDate;
const datesMessage = { message: 'Due date cannot be before the start date', path: ['dueDate'] };

const createBody = taskFields.refine(datesInOrder, datesMessage);
const updateBody = taskFields.partial().refine(datesInOrder, datesMessage);

const worklogBody = z.object({
  hours: z.number().positive().max(24),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().trim().max(500).nullable().optional(),
});

export const tasksRouter = Router();

tasksRouter.get('/', async (req, res) => {
  res.json(await service.listTasks(parse(listQuery, req.query)));
});

// Permission checks live in the service: they depend on the task's project and assignee.
tasksRouter.post('/', requireAuth, async (req, res) => {
  res.status(201).json(await service.createTask(req.user!, parse(createBody, req.body)));
});

tasksRouter.patch('/:id', requireAuth, async (req, res) => {
  const input = parse(updateBody, req.body);
  res.json(await service.updateTask(req.user!, String(req.params.id), input));
});

tasksRouter.delete('/:id', requireAuth, async (req, res) => {
  await service.deleteTask(req.user!, String(req.params.id));
  res.status(204).end();
});

tasksRouter.patch('/:id/move', requireAuth, async (req, res) => {
  const { status, order } = parse(moveBody, req.body);
  res.json(await service.moveTask(req.user!, String(req.params.id), status, order));
});

tasksRouter.post('/:id/worklogs', requireAuth, async (req, res) => {
  const input = parse(worklogBody, req.body);
  res.status(201).json(await service.logWork(req.user!, String(req.params.id), input));
});

// TODO(M2): sprint/epic assignment.
