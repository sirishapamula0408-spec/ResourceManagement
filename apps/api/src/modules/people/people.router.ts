import { Router } from 'express';
import * as service from './people.service.js';

export const peopleRouter = Router();

peopleRouter.get('/', async (_req, res) => {
  res.json(await service.listPeople());
});

peopleRouter.get('/departments', async (_req, res) => {
  res.json(await service.listDepartments());
});

// TODO(M1): create/update/deactivate people (ADMIN only via requireRole('ADMIN')).
