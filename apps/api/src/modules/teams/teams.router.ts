import { Router } from 'express';
import { isMember } from '../../lib/visibility.js';
import * as service from './teams.service.js';

export const teamsRouter = Router();

teamsRouter.get('/', async (req, res) => {
  res.json(await service.listTeams(isMember(req.user) ? req.user!.id : undefined));
});

// TODO(M1): create/update teams and manage membership (ADMIN, PM).
