import { Router } from 'express';
import { z } from 'zod';
import { ProjectStatus } from '../../generated/prisma/enums.js';
import { parse } from '../../lib/http.js';
import { STAFFING_ROLES } from '../../lib/permissions.js';
import { visibleProjectIds } from '../../lib/visibility.js';
import { requireRole } from '../../middleware/auth.js';
import * as service from './projects.service.js';

const optionalDate = z.coerce.date().nullable().optional();

const projectFields = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and dashes only')
    .transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1),
  client: z.string().trim().nullable().optional(),
  billable: z.boolean().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(ProjectStatus).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  ownerId: z.string().nullable().optional(),
});

const datesInOrder = (p: { startDate?: Date | null; endDate?: Date | null }) =>
  !p.startDate || !p.endDate || p.endDate >= p.startDate;
const datesMessage = {
  message: 'End date cannot be before the start date',
  path: ['endDate'],
};

const projectSchema = projectFields.refine(datesInOrder, datesMessage);
const projectPatchSchema = projectFields.partial().refine(datesInOrder, datesMessage);

const membersSchema = z.object({ personIds: z.array(z.string().min(1)) });

export const projectsRouter = Router();

projectsRouter.get('/', async (req, res) => {
  res.json(await service.listProjects(await visibleProjectIds(req.user!)));
});

// Writes: admins, delivery heads and resource managers maintain projects and staffing.
const canEdit = [requireRole(...STAFFING_ROLES)];

projectsRouter.post('/', ...canEdit, async (req, res) => {
  res.status(201).json(await service.createProject(parse(projectSchema, req.body)));
});

projectsRouter.patch('/:id', ...canEdit, async (req, res) => {
  const input = parse(projectPatchSchema, req.body);
  res.json(await service.updateProject(String(req.params.id), input));
});

projectsRouter.delete('/:id', ...canEdit, async (req, res) => {
  await service.deleteProject(String(req.params.id));
  res.status(204).end();
});

projectsRouter.put('/:id/members', ...canEdit, async (req, res) => {
  const { personIds } = parse(membersSchema, req.body);
  await service.setProjectMembers(String(req.params.id), personIds);
  res.status(204).end();
});
