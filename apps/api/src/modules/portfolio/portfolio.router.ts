import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { visibleProjectIds } from '../../lib/visibility.js';
import * as service from './portfolio.service.js';

const portfolioQuery = z.object({
  teamId: z.string().min(1).optional(),
  includeClosed: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const portfolioRouter = Router();

// GET /api/portfolio?teamId=...&includeClosed=true
// Team members only get their own projects (same rule as reports); viewers are kept out.
portfolioRouter.get('/', async (req, res) => {
  const query = parse(portfolioQuery, req.query);
  res.json(await service.portfolio(query, await visibleProjectIds(req.user!)));
});
