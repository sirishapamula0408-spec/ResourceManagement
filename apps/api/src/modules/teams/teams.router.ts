import { Router } from 'express';
import * as service from './teams.service.js';

export const teamsRouter = Router();

teamsRouter.get('/', async (_req, res) => {
  res.json(await service.listTeams());
});

// TODO(M1): create/update teams and manage membership (ADMIN, PM).
