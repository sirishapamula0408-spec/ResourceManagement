import { Router } from 'express';
import { z } from 'zod';
import { ProjectStatus } from '../../generated/prisma/enums.js';
import { parse } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as service from './projects.service.js';

const createProjectSchema = z.object({
  code: z.string().min(2).max(16),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(ProjectStatus).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  ownerId: z.string().optional(),
});

export const projectsRouter = Router();

projectsRouter.get('/', async (_req, res) => {
  res.json(await service.listProjects());
});

// Example of the role guard: only ADMIN and PM may create projects.
projectsRouter.post('/', requireAuth, requireRole('ADMIN', 'PM'), async (req, res) => {
  const input = parse(createProjectSchema, req.body);
  res.status(201).json(await service.createProject(input));
});
