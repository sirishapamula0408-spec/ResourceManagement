import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import type { AuthUser } from '../../middleware/auth.js';
import { requireSeeTask } from './comments.service.js';
import { canManageProject, taskKey } from './tasks.service.js';

/**
 * Links between tasks (M4 JIRA-lite): "blocks" / "is blocked by" and "relates to", possibly
 * across projects. A link is stored one way (from blocks to); each task shows it from its own side.
 * Anyone who can see a task sees its links; adding or removing one needs to manage either task's
 * project, or to be the task's assignee.
 */
export type LinkKind = 'BLOCKS' | 'BLOCKED_BY' | 'RELATES';

const other = {
  select: {
    id: true,
    number: true,
    title: true,
    status: true,
    project: { select: { code: true } },
  },
} as const;

type Other = {
  id: string;
  number: number;
  title: string;
  status: string;
  project: { code: string };
};
const view = (t: Other) => ({
  id: t.id,
  key: taskKey(t.project.code, t.number),
  title: t.title,
  status: t.status,
});

export async function listLinks(user: AuthUser, taskId: string) {
  await requireSeeTask(user, taskId);
  const [out, inbound] = await Promise.all([
    prisma.taskLink.findMany({ where: { fromId: taskId }, include: { to: other } }),
    prisma.taskLink.findMany({ where: { toId: taskId }, include: { from: other } }),
  ]);
  return [
    ...out.map((l) => ({
      id: l.id,
      kind: (l.type === 'BLOCKS' ? 'BLOCKS' : 'RELATES') as LinkKind,
      task: view(l.to),
    })),
    ...inbound.map((l) => ({
      id: l.id,
      kind: (l.type === 'BLOCKS' ? 'BLOCKED_BY' : 'RELATES') as LinkKind,
      task: view(l.from),
    })),
  ];
}

/** May this person change links on this task: manage its project, or be its assignee. */
async function canEdit(user: AuthUser, task: { projectId: string; assigneeId: string | null }) {
  return task.assigneeId === user.id || (await canManageProject(user, task.projectId));
}

// Plain messages: the dialog shows them as they are.
const fieldError = (message: string) => new HttpError(400, message);

/** Find a task by its key, e.g. "ATLAS-12" (case does not matter). */
async function findByKey(key: string) {
  const match = /^([A-Za-z0-9_-]+)-(\d+)$/.exec(key.trim());
  if (!match) throw fieldError('Enter a task key like ATLAS-12');
  const task = await prisma.task.findFirst({
    where: {
      number: Number(match[2]),
      project: { code: { equals: match[1], mode: 'insensitive' } },
    },
    select: { id: true },
  });
  if (!task) throw fieldError(`No task ${key.trim().toUpperCase()}`);
  return task.id;
}

export async function addLink(
  user: AuthUser,
  taskId: string,
  input: { kind: LinkKind; targetKey: string },
) {
  await requireSeeTask(user, taskId);
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { projectId: true, assigneeId: true },
  });
  if (!(await canEdit(user, task))) {
    throw new HttpError(403, 'Only an admin, a PM on this project or the assignee can link tasks');
  }
  const targetId = await findByKey(input.targetKey);
  // A task you cannot see is reported the same as a missing one.
  await requireSeeTask(user, targetId).catch(() => {
    throw fieldError(`No task ${input.targetKey.trim().toUpperCase()}`);
  });
  if (targetId === taskId) throw fieldError('A task cannot be linked to itself');

  const [fromId, toId] = input.kind === 'BLOCKED_BY' ? [targetId, taskId] : [taskId, targetId];
  const type = input.kind === 'RELATES' ? 'RELATES' : 'BLOCKS';
  // The same pair can be linked once per type, in either direction.
  const existing = await prisma.taskLink.findFirst({
    where: {
      type,
      OR: [
        { fromId, toId },
        { fromId: toId, toId: fromId },
      ],
    },
  });
  if (existing) {
    throw new HttpError(409, 'These tasks are already linked that way');
  }
  await prisma.taskLink.create({ data: { type, fromId, toId } });
  return listLinks(user, taskId);
}

export async function removeLink(user: AuthUser, taskId: string, linkId: string) {
  await requireSeeTask(user, taskId);
  const link = await prisma.taskLink.findFirst({
    where: { id: linkId, OR: [{ fromId: taskId }, { toId: taskId }] },
    include: {
      from: { select: { projectId: true, assigneeId: true } },
      to: { select: { projectId: true, assigneeId: true } },
    },
  });
  if (!link) throw new HttpError(404, 'Link not found');
  if (!(await canEdit(user, link.from)) && !(await canEdit(user, link.to))) {
    throw new HttpError(403, 'Only an admin, a PM on either project or an assignee can unlink');
  }
  await prisma.taskLink.delete({ where: { id: linkId } });
}
