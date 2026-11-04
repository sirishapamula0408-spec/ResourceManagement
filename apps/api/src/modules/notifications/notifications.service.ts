import type { NotificationType, TaskStatus } from '../../generated/prisma/enums.js';
import { HttpError } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { isMember, projectIdsOf } from '../../lib/visibility.js';
import type { AuthUser } from '../../middleware/auth.js';
import { taskKey } from '../tasks/tasks.service.js';

/**
 * In-app notifications (M4 JIRA-lite): someone assigned you a task, commented on a task you are
 * assigned to or created, or changed the status of a task assigned to you. Never for your own
 * actions. They are created by the task and comment services as those changes happen.
 */

const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  BLOCKED: 'Blocked',
  DONE: 'Done',
};

/**
 * Create one notification per recipient, skipping the actor and empty recipients. A failure here
 * is logged and never undoes the change that caused it.
 */
async function notify(
  actorId: string,
  taskId: string,
  type: NotificationType,
  recipients: (string | null | undefined)[],
  message: string,
) {
  const ids = [...new Set(recipients)].filter((id): id is string => !!id && id !== actorId);
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({
      data: ids.map((recipientId) => ({ recipientId, actorId, taskId, type, message })),
    });
  } catch (e) {
    console.error('Could not create notifications', e);
  }
}

/** The task was assigned to someone (on create or edit). */
export const notifyAssigned = (actorId: string, taskId: string, assigneeId: string | null) =>
  notify(actorId, taskId, 'ASSIGNED', [assigneeId], 'assigned this task to you');

/** Someone changed the status of a task; its assignee hears about it. */
export const notifyStatus = (
  actorId: string,
  task: { id: string; assigneeId: string | null },
  from: TaskStatus,
  to: TaskStatus,
) =>
  notify(
    actorId,
    task.id,
    'STATUS_CHANGED',
    [task.assigneeId],
    `changed the status from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}`,
  );

/** A new comment: the task's assignee and creator hear about it. */
export async function notifyComment(actorId: string, taskId: string, body: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, createdById: true },
  });
  if (!task) return;
  const excerpt = body.replace(/\s+/g, ' ').trim();
  await notify(
    actorId,
    taskId,
    'COMMENTED',
    [task.assigneeId, task.createdById],
    `commented: “${excerpt.length > 140 ? `${excerpt.slice(0, 140)}…` : excerpt}”`,
  );
}

// ---------- Reading ----------

/**
 * A team member only gets notifications about tasks they can still see (their projects' tasks
 * and tasks assigned to them), e.g. not after being taken off a task on another project.
 */
async function visibleWhere(user: AuthUser) {
  if (!isMember(user)) return {};
  const projectIds = await projectIdsOf(user.id);
  return { task: { OR: [{ projectId: { in: projectIds } }, { assigneeId: user.id }] } };
}

const unreadCount = async (user: AuthUser) =>
  prisma.notification.count({
    where: { recipientId: user.id, readAt: null, ...(await visibleWhere(user)) },
  });

/** Your notifications, newest first (the latest 50), with the unread count. */
export async function listNotifications(user: AuthUser, onlyUnread: boolean) {
  const rows = await prisma.notification.findMany({
    where: {
      recipientId: user.id,
      ...(onlyUnread ? { readAt: null } : {}),
      ...(await visibleWhere(user)),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      actor: { select: { id: true, name: true } },
      task: {
        select: { id: true, number: true, title: true, project: { select: { code: true } } },
      },
    },
  });
  return {
    unreadCount: await unreadCount(user),
    items: rows.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      createdAt: n.createdAt,
      readAt: n.readAt,
      actor: n.actor,
      task: {
        id: n.task.id,
        key: taskKey(n.task.project.code, n.task.number),
        title: n.task.title,
      },
    })),
  };
}

export const countUnread = async (user: AuthUser) => ({ unreadCount: await unreadCount(user) });

export async function markRead(user: AuthUser, id: string) {
  const { count } = await prisma.notification.updateMany({
    where: { id, recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  // Already read is fine; someone else's (or missing) is not found.
  if (!count && !(await prisma.notification.count({ where: { id, recipientId: user.id } }))) {
    throw new HttpError(404, 'Notification not found');
  }
  return countUnread(user);
}

export async function markAllRead(user: AuthUser) {
  await prisma.notification.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return countUnread(user);
}
