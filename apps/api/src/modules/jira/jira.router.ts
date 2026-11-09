import { Router } from 'express';
import { config } from '../../config.js';
import { HttpError } from '../../lib/http.js';
import { STAFFING_ROLES } from '../../lib/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middleware/auth.js';
import { canManageProject } from '../tasks/tasks.service.js';
import { jiraConfigured, jiraFromConfig } from './jira.client.js';
import { syncProject } from './jira.sync.js';

export const jiraRouter = Router();

// Staffing roles and PMs see sync status; team members, viewers and sales don't.
jiraRouter.use(requireRole(...STAFFING_ROLES, 'PM'));

/** Whether JIRA is set up, and its address (for links to issues). */
jiraRouter.get('/status', (_req, res) => {
  res.json({
    configured: jiraConfigured(),
    baseUrl: config.JIRA_BASE_URL ?? null,
    intervalMinutes: config.JIRA_SYNC_MINUTES,
  });
});

/** A project's JIRA link and its last 10 syncs. */
jiraRouter.get('/projects/:id', async (req, res) => {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: String(req.params.id) },
    select: { id: true, jiraKey: true },
  });
  const runs = await prisma.jiraSyncRun.findMany({
    where: { projectId: project.id },
    orderBy: { startedAt: 'desc' },
    take: 10,
  });
  res.json({ jiraKey: project.jiraKey, configured: jiraConfigured(), runs });
});

/** Sync a project now: staffing roles, or a PM who owns or is staffed on it. */
jiraRouter.post('/projects/:id/sync', async (req, res) => {
  const id = String(req.params.id);
  if (!STAFFING_ROLES.includes(req.user!.role) && !(await canManageProject(req.user!, id))) {
    throw new HttpError(403, 'Only people who manage this project can sync it');
  }
  const client = jiraFromConfig();
  if (!client) throw new HttpError(409, 'JIRA isn’t connected. Ask an administrator to set it up.');
  res.json(await syncProject(id, client));
});
