import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFound } from './lib/http.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './modules/auth/auth.router.js';
import { dashboardRouter } from './modules/dashboard/dashboard.router.js';
import { peopleRouter } from './modules/people/people.router.js';
import { projectsRouter } from './modules/projects/projects.router.js';
import { tasksRouter } from './modules/tasks/tasks.router.js';
import { teamsRouter } from './modules/teams/teams.router.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (config.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'resource-board-api', time: new Date().toISOString() });
  });

  // Everything except health and sign-in requires a signed-in, active user.
  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth);
  app.use('/api/people', peopleRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/dashboard', dashboardRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
