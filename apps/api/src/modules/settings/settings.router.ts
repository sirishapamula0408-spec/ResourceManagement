import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { requireRole } from '../../middleware/auth.js';
import * as thresholds from './thresholds.service.js';

const thresholdsSchema = z
  .object({
    underUtilizedPct: z.number().min(1).max(100),
    overUtilizedPct: z.number().min(50).max(300),
  })
  .refine((t) => t.underUtilizedPct < t.overUtilizedPct, {
    message: 'The under-utilized limit must be below the over-utilized limit',
    path: ['underUtilizedPct'],
  });

export const settingsRouter = Router();

settingsRouter.get('/thresholds', async (_req, res) => {
  res.json(await thresholds.getThresholds());
});

// Only admins change the organisation's limits.
settingsRouter.put('/thresholds', requireRole('ADMIN'), async (req, res) => {
  const before = await thresholds.getThresholds();
  const after = await thresholds.setThresholds(parse(thresholdsSchema, req.body));
  await audit(req, 'settings.thresholds', 'Settings', null, { before, after });
  res.json(after);
});
