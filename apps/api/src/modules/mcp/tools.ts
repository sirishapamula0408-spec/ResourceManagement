import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  LeadPriority,
  LeadSource,
  LeadStage,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../../generated/prisma/enums.js';
import { type AuthUser, signToken } from '../../middleware/auth.js';

type Method = 'GET' | 'POST' | 'PATCH';
export type ApiCall = (method: Method, path: string, body?: unknown) => Promise<CallToolResult>;

/**
 * Calls the app's own REST API over loopback as the connector's user. Every tool goes through the
 * same routes, role checks and visibility rules as the web app, so the connector can never see or
 * do more than that person can in the browser.
 */
export function loopbackApi(app: Express) {
  let base: Promise<string> | undefined;
  const start = () =>
    new Promise<string>((resolve, reject) => {
      const server = http.createServer(app);
      server.unref();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () =>
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
      );
    });

  return (user: AuthUser): ApiCall =>
    async (method, path, body) => {
      base ??= start();
      const res = await fetch(`${await base}/api${path}`, {
        method,
        headers: { authorization: `Bearer ${signToken(user)}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        const error = text ? (JSON.parse(text) as { error?: string; details?: unknown }) : {};
        const details = error.details ? `\n${JSON.stringify(error.details)}` : '';
        return {
          isError: true,
          content: [
            { type: 'text', text: `${res.status}: ${error.error ?? res.statusText}${details}` },
          ],
        };
      }
      return { content: [{ type: 'text', text: text || 'Done.' }] };
    };
}

/** Query string from the defined values only. */
const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

const date = z.iso.date().describe('YYYY-MM-DD');
const id = (what: string) => z.string().min(1).describe(`${what} id (from the matching list tool)`);
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const taskFields = {
  title: z.string().min(1).max(200).describe('Short summary'),
  description: z.string().nullable().optional(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  type: z.enum(TaskType).optional(),
  assigneeId: id('Person').nullable().optional(),
  estimateHours: z.number().min(0).max(1000).nullable().optional(),
  startDate: date.nullable().optional(),
  dueDate: date.nullable().optional(),
};

const leadFields = {
  company: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  contactEmail: z.email().nullable().optional(),
  contactPhone: z.string().max(40).nullable().optional(),
  source: z.enum(LeadSource).optional(),
  stage: z.enum(LeadStage).optional(),
  priority: z.enum(LeadPriority).optional(),
  estimatedValue: z.number().min(0).nullable().optional().describe('INR'),
  expectedCloseDate: date.nullable().optional(),
  nextFollowUp: date.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lostReason: z.string().max(2000).nullable().optional(),
  ownerId: id('Person').nullable().optional(),
};

/** One MCP server per request, bound to the signed-in person. */
export function createMcpServer(api: ApiCall) {
  const server = new McpServer(
    { name: 'resource-board', version: '1.0.0' },
    {
      instructions:
        'Resource Board is the company resource management app: projects, people, teams, tasks, ' +
        'hours, utilization dashboards, status reports and the sales leads pipeline. Every tool acts ' +
        'as the signed-in user, with exactly their role and access; a 403 means their role does not ' +
        'allow it. Look up ids with the list tools before creating or updating anything.',
    },
  );

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'The signed-in user: name, email and role.',
      annotations: READ,
    },
    () => api('GET', '/auth/me'),
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'Projects the user can see, with owner, status, dates, team and hours.',
      annotations: READ,
    },
    () => api('GET', '/projects'),
  );

  server.registerTool(
    'list_people',
    {
      title: 'List people',
      description: 'People with department, role and active status.',
      annotations: READ,
    },
    () => api('GET', '/people'),
  );

  server.registerTool(
    'list_teams',
    { title: 'List teams', description: 'Teams and their members.', annotations: READ },
    () => api('GET', '/teams'),
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description: 'Tasks the user can see, optionally filtered by project, assignee or status.',
      inputSchema: {
        projectId: id('Project').optional(),
        assigneeId: id('Person').optional(),
        status: z.enum(TaskStatus).optional(),
      },
      annotations: READ,
    },
    (args) => api('GET', `/tasks${qs(args)}`),
  );

  server.registerTool(
    'dashboard',
    {
      title: 'Utilization dashboard',
      description:
        'KPIs, team demand vs availability, department hours and the person-by-week utilization ' +
        'heatmap. Default window: two weeks before this week, eight weeks long.',
      inputSchema: {
        from: date.optional().describe('Start week (YYYY-MM-DD)'),
        weeks: z.number().int().min(1).max(26).optional(),
        projectId: id('Project').optional(),
      },
      annotations: READ,
    },
    (args) => api('GET', `/dashboard/overview${qs(args)}`),
  );

  server.registerTool(
    'status_report',
    {
      title: 'Project status report',
      description: 'Weekly or monthly status report per project: progress, hours, risks, health.',
      inputSchema: {
        period: z.enum(['week', 'month']).optional(),
        date: date.optional().describe('Any day in the week or month to report on'),
        projectId: id('Project').optional(),
      },
      annotations: READ,
    },
    (args) => api('GET', `/reports/status${qs(args)}`),
  );

  server.registerTool(
    'list_leads',
    {
      title: 'List sales leads',
      description: 'The sales pipeline (admins, sales, delivery heads and PMs).',
      annotations: READ,
    },
    () => api('GET', '/leads'),
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description: 'Create a task on a project (admins, and PMs on projects they own or staff).',
      inputSchema: { projectId: id('Project'), ...taskFields },
      annotations: WRITE,
    },
    (args) => api('POST', '/tasks', args),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description:
        'Change a task. Send only the fields to change. Assignees may change the status of their ' +
        'own tasks; other changes need an admin or the project PM.',
      inputSchema: {
        taskId: id('Task'),
        projectId: id('Project').optional(),
        ...z.object(taskFields).partial().shape,
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ taskId, ...changes }) => api('PATCH', `/tasks/${encodeURIComponent(taskId)}`, changes),
  );

  server.registerTool(
    'log_hours',
    {
      title: 'Log hours',
      description: 'Log hours worked on a task as the signed-in user.',
      inputSchema: {
        taskId: id('Task'),
        hours: z.number().positive().max(24),
        date: date.optional().describe('Defaults to today'),
        note: z.string().max(500).optional(),
      },
      annotations: WRITE,
    },
    ({ taskId, ...worklog }) =>
      api('POST', `/tasks/${encodeURIComponent(taskId)}/worklogs`, worklog),
  );

  server.registerTool(
    'create_lead',
    {
      title: 'Create sales lead',
      description: 'Add a lead to the sales pipeline (admins and sales).',
      inputSchema: leadFields,
      annotations: WRITE,
    },
    (args) => api('POST', '/leads', args),
  );

  server.registerTool(
    'update_lead',
    {
      title: 'Update sales lead',
      description:
        'Change a lead, e.g. its stage or next follow-up. Send only the fields to change.',
      inputSchema: { leadId: id('Lead'), ...z.object(leadFields).partial().shape },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ leadId, ...changes }) => api('PATCH', `/leads/${encodeURIComponent(leadId)}`, changes),
  );

  return server;
}
