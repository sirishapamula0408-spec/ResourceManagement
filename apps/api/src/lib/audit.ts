import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from './prisma.js';

/** Fields never written to the audit log. */
const SECRET = new Set(['password', 'passwordHash', 'token']);

/** Dates as YYYY-MM-DD and secrets dropped, so the entry is plain JSON. */
function clean(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k, v]) => !SECRET.has(k) && v !== undefined)
        .map(([k, v]) => [k, clean(v)]),
    );
  }
  return value;
}

/**
 * Record an administrative change (people, projects, teams, leave, settings) in the audit log,
 * by the signed-in user. Task changes and sign-ins have their own recorders
 * (tasks/history.service.ts, auth/auth.service.ts) and land in the same table.
 */
export async function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId: string | null,
  change: { before?: unknown; after?: unknown } = {},
) {
  await prisma.auditLog.create({
    data: {
      actorId: req.user?.id ?? null,
      action,
      entityType,
      entityId,
      ip: req.ip,
      before:
        change.before === undefined ? undefined : (clean(change.before) as Prisma.InputJsonValue),
      after:
        change.after === undefined ? undefined : (clean(change.after) as Prisma.InputJsonValue),
    },
  });
}
