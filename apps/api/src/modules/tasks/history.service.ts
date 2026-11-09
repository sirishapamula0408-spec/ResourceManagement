import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { requireSeeTask } from './comments.service.js';
import { taskKey } from './tasks.service.js';

/**
 * Task history (M4 JIRA-lite), kept in the audit log: who created, changed or deleted a task,
 * when, and the before and after values of the fields that changed.
 */
export const TRACKED = [
  'title',
  'description',
  'status',
  'priority',
  'type',
  'assigneeId',
  'estimateHours',
  'startDate',
  'dueDate',
  'sprintId',
  'epicId',
  'parentId',
  'projectId',
  'labels',
] as const;
type Field = (typeof TRACKED)[number];
type Snapshot = Partial<Record<Field, unknown>>;

/** Select clause for a before/after snapshot of the tracked fields. */
export const trackedSelect = Object.fromEntries(TRACKED.map((f) => [f, true])) as Record<
  Field,
  true
>;

/** JSON-safe value: dates as YYYY-MM-DD, decimals as numbers. */
function plain(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return v ?? null;
}

/** The tracked fields whose values differ, as { before, after } snapshots (null = nothing changed). */
export function diff(before: Snapshot, after: Snapshot) {
  const b: Snapshot = {};
  const a: Snapshot = {};
  for (const f of TRACKED) {
    const x = plain(before[f]);
    const y = plain(after[f]);
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      b[f] = x;
      a[f] = y;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

/** Record one entry; changes with no tracked difference are skipped. */
export async function record(
  actorId: string | null,
  taskId: string,
  action:
    'task.create' | 'task.update' | 'task.delete' | 'task.worklog' | 'task.attach' | 'task.detach',
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  /** "jira" when the JIRA sync made the change (no actor). */
  via?: string,
) {
  const asPlain = (snap: Record<string, unknown> | null) =>
    snap && Object.fromEntries(Object.entries(snap).map(([k, v]) => [k, plain(v)]));
  const data =
    action === 'task.update'
      ? diff(before ?? {}, after ?? {})
      : { before: asPlain(before), after: asPlain(after) };
  if (!data) return;
  await prisma.auditLog.create({
    data: {
      actorId,
      via,
      action,
      entityType: 'Task',
      entityId: taskId,
      before: (data.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (data.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

const ID_FIELDS: Partial<Record<Field, 'person' | 'sprint' | 'epic' | 'task' | 'project'>> = {
  assigneeId: 'person',
  sprintId: 'sprint',
  epicId: 'epic',
  parentId: 'task',
  projectId: 'project',
};

/**
 * A task's history, newest first. Ids are shown as names (people, sprints, epics, projects) or
 * keys (parent tasks); something since deleted shows as "(deleted)".
 */
export async function listHistory(user: AuthUser, taskId: string) {
  await requireSeeTask(user, taskId);
  const rows = await prisma.auditLog.findMany({
    where: { entityType: 'Task', entityId: taskId },
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, name: true } } },
    take: 200,
  });

  // Every id mentioned, by kind, looked up once.
  const ids = {
    person: new Set<string>(),
    sprint: new Set<string>(),
    epic: new Set<string>(),
    task: new Set<string>(),
    project: new Set<string>(),
  };
  for (const r of rows) {
    for (const side of [r.before, r.after] as Snapshot[]) {
      for (const [f, kind] of Object.entries(ID_FIELDS)) {
        const v = side?.[f as Field];
        if (typeof v === 'string') ids[kind!].add(v);
      }
    }
  }
  const [people, sprints, epics, tasks, projects] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: [...ids.person] } },
      select: { id: true, name: true },
    }),
    prisma.sprint.findMany({
      where: { id: { in: [...ids.sprint] } },
      select: { id: true, name: true },
    }),
    prisma.epic.findMany({
      where: { id: { in: [...ids.epic] } },
      select: { id: true, name: true },
    }),
    prisma.task.findMany({
      where: { id: { in: [...ids.task] } },
      select: { id: true, number: true, project: { select: { code: true } } },
    }),
    prisma.project.findMany({
      where: { id: { in: [...ids.project] } },
      select: { id: true, code: true },
    }),
  ]);
  const names: Record<string, Map<string, string>> = {
    person: new Map(people.map((p) => [p.id, p.name])),
    sprint: new Map(sprints.map((s) => [s.id, s.name])),
    epic: new Map(epics.map((e) => [e.id, e.name])),
    task: new Map(tasks.map((t) => [t.id, taskKey(t.project.code, t.number)])),
    project: new Map(projects.map((p) => [p.id, p.code])),
  };
  const show = (f: string, v: unknown) => {
    const kind = ID_FIELDS[f as Field];
    if (kind && typeof v === 'string') return names[kind].get(v) ?? '(deleted)';
    return v;
  };

  return rows.map((r) => {
    const before = (r.before ?? {}) as Snapshot;
    const after = (r.after ?? {}) as Snapshot;
    const fields = r.action === 'task.update' ? Object.keys(after) : [];
    return {
      id: r.id,
      action: r.action.replace('task.', ''),
      at: r.createdAt,
      actor: r.via === 'jira' ? { id: 'jira', name: 'JIRA sync' } : r.actor,
      changes: fields.map((f) => ({
        field: f.replace(/Id$/, ''),
        from: show(f, before[f as Field]),
        to: show(f, after[f as Field]),
      })),
      // Worklogs: the hours logged.
      hours: r.action === 'task.worklog' ? ((after as { hours?: number }).hours ?? null) : null,
      // Attachments added or removed: the file name.
      attachment:
        r.action === 'task.attach' || r.action === 'task.detach'
          ? (((r.action === 'task.attach' ? after : before) as { attachment?: string })
              .attachment ?? null)
          : null,
    };
  });
}
