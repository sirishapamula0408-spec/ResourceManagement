import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import * as service from './dashboard.service.js';

export const dashboardRouter = Router();

// Shared by every widget endpoint: ?from=YYYY-MM-DD&weeks=8&projectId=...
const windowQuery = z.object({
  from: z.iso
    .date()
    .transform((s) => new Date(`${s}T00:00:00Z`))
    .optional(),
  weeks: z.coerce.number().int().min(1).max(26).default(8),
  projectId: z.string().min(1).optional(),
});

dashboardRouter.get('/summary', async (_req, res) => {
  res.json(await service.getSummary());
});

dashboardRouter.get('/overview', async (req, res) => {
  res.json(await service.getOverview(parse(windowQuery, req.query)));
});

dashboardRouter.get('/kpis', async (req, res) => {
  res.json(await service.getKpis(parse(windowQuery, req.query)));
});

dashboardRouter.get('/demand-vs-availability', async (req, res) => {
  res.json(await service.getDemandVsAvailability(parse(windowQuery, req.query)));
});

dashboardRouter.get('/departments', async (req, res) => {
  res.json(await service.getDepartments(parse(windowQuery, req.query)));
});

dashboardRouter.get('/heatmap', async (req, res) => {
  res.json(await service.getHeatmap(parse(windowQuery, req.query)));
});
