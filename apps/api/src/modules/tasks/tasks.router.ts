import { Router } from 'express';
import { z } from 'zod';
import { TaskStatus } from '../../generated/prisma/enums.js';
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

export const tasksRouter = Router();

tasksRouter.get('/', async (req, res) => {
  res.json(await service.listTasks(parse(listQuery, req.query)));
});

tasksRouter.patch('/:id/move', requireAuth, async (req, res) => {
  const { status, order } = parse(moveBody, req.body);
  res.json(await service.moveTask(String(req.params.id), status, order));
});

// TODO(M1): create/update/delete tasks; TODO(M2): worklogs, sprint/epic assignment.
