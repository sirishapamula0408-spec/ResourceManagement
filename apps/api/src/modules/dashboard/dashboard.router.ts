import { Router } from 'express';
import * as service from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', async (_req, res) => {
  res.json(await service.getSummary());
});

// TODO(M1): /kpis, /demand-vs-availability, /departments, /heatmap
