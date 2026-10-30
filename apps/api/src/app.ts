import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFound } from './lib/http.js';
import { requireAuth, salesAreaGuard } from './middleware/auth.js';
import { authRouter } from './modules/auth/auth.router.js';
import { dashboardRouter } from './modules/dashboard/dashboard.router.js';
import { peopleRouter } from './modules/people/people.router.js';
import { leadsRouter } from './modules/leads/leads.router.js';
import { consentRouter } from './modules/mcp/consent.router.js';
import { mcpRouter } from './modules/mcp/mcp.router.js';
import { projectsRouter } from './modules/projects/projects.router.js';
import { reportsRouter } from './modules/reports/reports.router.js';
import { tasksRouter } from './modules/tasks/tasks.router.js';
import { teamsRouter } from './modules/teams/teams.router.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Behind nginx (deploy/nginx.conf): use the client address it forwards, e.g. for rate limits.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (config.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'resource-board-api', time: new Date().toISOString() });
  });

  // Claude connector (MCP + OAuth sign-in); needs the app's public address.
  if (config.PUBLIC_URL) app.use(mcpRouter(app, config.PUBLIC_URL));

  // Everything except health and sign-in requires a signed-in, active user.
  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth);
  app.use('/api', salesAreaGuard);
  app.use('/api/people', peopleRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/oauth', consentRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
