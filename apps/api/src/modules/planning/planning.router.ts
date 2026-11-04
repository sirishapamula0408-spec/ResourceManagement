import { Router } from 'express';
import { z } from 'zod';
import { SprintStatus } from '../../generated/prisma/enums.js';
import { parse } from '../../lib/http.js';
import { visibleProjectIds } from '../../lib/visibility.js';
import * as service from './planning.service.js';

const listQuery = z.object({ projectId: z.string().optional() });
const optionalDate = z.coerce.date().nullable().optional();
const optionalText = z.string().trim().max(500).nullable().optional();

const sprintFields = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, 'Name the sprint').max(80),
  goal: optionalText,
  startDate: optionalDate,
  endDate: optionalDate,
});
const datesInOrder = (s: { startDate?: Date | null; endDate?: Date | null }) =>
  !s.startDate || !s.endDate || s.endDate >= s.startDate;
const datesMessage = { message: 'The end date cannot be before the start date', path: ['endDate'] };
const sprintCreate = sprintFields.refine(datesInOrder, datesMessage);
const sprintUpdate = sprintFields
  .omit({ projectId: true })
  .partial()
  .extend({ status: z.enum(SprintStatus).optional() })
  .refine(datesInOrder, datesMessage);

const epicFields = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, 'Name the epic').max(80),
  description: optionalText,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #2f7d6d')
    .nullable()
    .optional(),
});
const epicUpdate = epicFields.omit({ projectId: true }).partial();

/** Sprints and epics (M2). Everyone may list them (team members: their projects only). */
export const planningRouter = Router();

planningRouter.get('/sprints', async (req, res) => {
  const { projectId } = parse(listQuery, req.query);
  res.json(await service.listSprints(projectId, await visibleProjectIds(req.user!)));
});

planningRouter.post('/sprints', async (req, res) => {
  res.status(201).json(await service.createSprint(req.user!, parse(sprintCreate, req.body)));
});

planningRouter.patch('/sprints/:id', async (req, res) => {
  const input = parse(sprintUpdate, req.body);
  res.json(await service.updateSprint(req.user!, String(req.params.id), input));
});

planningRouter.delete('/sprints/:id', async (req, res) => {
  await service.deleteSprint(req.user!, String(req.params.id));
  res.status(204).end();
});

planningRouter.get('/epics', async (req, res) => {
  const { projectId } = parse(listQuery, req.query);
  res.json(await service.listEpics(projectId, await visibleProjectIds(req.user!)));
});

planningRouter.post('/epics', async (req, res) => {
  res.status(201).json(await service.createEpic(req.user!, parse(epicFields, req.body)));
});

planningRouter.patch('/epics/:id', async (req, res) => {
  const input = parse(epicUpdate, req.body);
  res.json(await service.updateEpic(req.user!, String(req.params.id), input));
});

planningRouter.delete('/epics/:id', async (req, res) => {
  await service.deleteEpic(req.user!, String(req.params.id));
  res.status(204).end();
});
