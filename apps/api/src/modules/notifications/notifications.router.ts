import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import * as service from './notifications.service.js';

const listQuery = z.object({ unread: z.enum(['0', '1', 'true', 'false']).optional() });

/** Your own in-app notifications (M4 JIRA-lite). */
export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const { unread } = parse(listQuery, req.query);
  res.json(await service.listNotifications(req.user!, unread === '1' || unread === 'true'));
});

notificationsRouter.get('/count', async (req, res) => {
  res.json(await service.countUnread(req.user!));
});

notificationsRouter.post('/read-all', async (req, res) => {
  res.json(await service.markAllRead(req.user!));
});

notificationsRouter.post('/:id/read', async (req, res) => {
  res.json(await service.markRead(req.user!, String(req.params.id)));
});
