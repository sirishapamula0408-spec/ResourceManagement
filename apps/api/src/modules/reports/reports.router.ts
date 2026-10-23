import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { visibleProjectIds } from '../../lib/visibility.js';
import * as service from './reports.service.js';

const statusQuery = z.object({
  period: z.enum(['week', 'month']).default('week'),
  date: z.iso
    .date()
    .transform((s) => new Date(`${s}T00:00:00Z`))
    .optional(),
  projectId: z.string().min(1).optional(),
});

export const reportsRouter = Router();

// GET /api/reports/status?period=week|month&date=YYYY-MM-DD&projectId=...
// Team members only get their own projects (same rule as the rest of the app).
reportsRouter.get('/status', async (req, res) => {
  const query = parse(statusQuery, req.query);
  res.json(await service.statusReport(query, await visibleProjectIds(req.user!)));
});
