import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { requireRole } from '../../middleware/auth.js';
import * as service from './audit.service.js';

const day = z.iso.date().transform((s) => new Date(`${s}T00:00:00Z`));

const auditQuery = z.object({
  area: z.enum(['task', 'auth', 'person', 'project', 'team', 'leave', 'settings']).optional(),
  actorId: z.string().min(1).optional(),
  from: day.optional(),
  to: day.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
});

export const auditRouter = Router();

// GET /api/audit?area=&actorId=&from=&to=&limit=&cursor= - admins only.
auditRouter.get('/', requireRole('ADMIN'), async (req, res) => {
  res.json(await service.listAudit(parse(auditQuery, req.query)));
});
