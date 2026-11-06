import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { taskKey } from '../tasks/tasks.service.js';

export interface AuditQuery {
  /** Area: the part of the action before the dot, e.g. "task", "auth", "person". */
  area?: string;
  actorId?: string;
  from?: Date;
  /** Inclusive day. */
  to?: Date;
  limit: number;
  /** The id of the last entry already shown (newest first). */
  cursor?: string;
}

/** Readable names for the entries' subjects, looked up in one query per type. */
async function labels(entries: { entityType: string; entityId: string | null }[]) {
  const ids = (type: string) => [
    ...new Set(entries.filter((e) => e.entityType === type && e.entityId).map((e) => e.entityId!)),
  ];
  const [people, projects, teams, tasks] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: ids('Person') } },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { id: { in: ids('Project') } },
      select: { id: true, code: true, name: true },
    }),
    prisma.team.findMany({ where: { id: { in: ids('Team') } }, select: { id: true, name: true } }),
    prisma.task.findMany({
      where: { id: { in: ids('Task') } },
      select: { id: true, number: true, title: true, project: { select: { code: true } } },
    }),
  ]);
  return new Map<string, string>([
    ...people.map((p) => [p.id, p.name] as const),
    ...projects.map((p) => [p.id, `${p.code} · ${p.name}`] as const),
    ...teams.map((t) => [t.id, t.name] as const),
    ...tasks.map((t) => [t.id, `${taskKey(t.project.code, t.number)} · ${t.title}`] as const),
  ]);
}

export async function listAudit(q: AuditQuery) {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.area ? { action: { startsWith: `${q.area}.` } } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: q.from } : {}),
            ...(q.to ? { lt: new Date(q.to.getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { actor: { select: { id: true, name: true } } },
  });
  const page = rows.slice(0, q.limit);
  const names = await labels(page);
  return {
    entries: page.map((r) => ({
      id: r.id,
      at: r.createdAt,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      // Removed records keep their entries; they just lose the readable name.
      entity: (r.entityId && names.get(r.entityId)) ?? null,
      actor: r.actor,
      ip: r.ip,
      before: r.before,
      after: r.after,
    })),
    nextCursor: rows.length > q.limit ? page[page.length - 1].id : null,
  };
}
