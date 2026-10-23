import { type Request, Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { isMember } from '../../lib/visibility.js';
import * as service from './dashboard.service.js';

export const dashboardRouter = Router();

/** The window from the query string, limited to the caller themselves for team members. */
const scoped = (req: Request): service.DashboardQuery => ({
  ...parse(windowQuery, req.query),
  personId: isMember(req.user) ? req.user!.id : undefined,
});

// Shared by every widget endpoint: ?from=YYYY-MM-DD&weeks=8&projectId=...
const windowQuery = z.object({
  from: z.iso
    .date()
    .transform((s) => new Date(`${s}T00:00:00Z`))
    .optional(),
  weeks: z.coerce.number().int().min(1).max(26).default(8),
  projectId: z.string().min(1).optional(),
});

dashboardRouter.get('/overview', async (req, res) => {
  res.json(await service.getOverview(scoped(req)));
});

dashboardRouter.get('/kpis', async (req, res) => {
  res.json(await service.getKpis(scoped(req)));
});

dashboardRouter.get('/demand-vs-availability', async (req, res) => {
  res.json(await service.getDemandVsAvailability(scoped(req)));
});

dashboardRouter.get('/departments', async (req, res) => {
  res.json(await service.getDepartments(scoped(req)));
});

dashboardRouter.get('/heatmap', async (req, res) => {
  res.json(await service.getHeatmap(scoped(req)));
});
