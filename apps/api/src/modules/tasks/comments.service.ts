import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import { isMember, projectIdsOf } from '../../lib/visibility.js';
import type { AuthUser } from '../../middleware/auth.js';

/**
 * Comments on a task (M4 JIRA-lite). Anyone who can see the task may read and add comments;
 * a team member sees the tasks on their projects and those assigned to them. Only the author
 * edits a comment; the author or an admin deletes it.
 */
export async function requireSeeTask(user: AuthUser, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, assigneeId: true },
  });
  // Same answer for "missing" and "not yours", so ids can't be probed.
  const hidden =
    !task ||
    (isMember(user) &&
      task.assigneeId !== user.id &&
      !(await projectIdsOf(user.id)).includes(task.projectId));
  if (hidden) throw new HttpError(404, 'Task not found');
}

const author = { select: { id: true, name: true } };

export async function listComments(user: AuthUser, taskId: string) {
  await requireSeeTask(user, taskId);
  return prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    include: { author },
  });
}

export async function addComment(user: AuthUser, taskId: string, body: string) {
  await requireSeeTask(user, taskId);
  return prisma.comment.create({ data: { taskId, authorId: user.id, body }, include: { author } });
}

async function getComment(taskId: string, id: string) {
  const comment = await prisma.comment.findFirst({ where: { id, taskId } });
  if (!comment) throw new HttpError(404, 'Comment not found');
  return comment;
}

export async function editComment(user: AuthUser, taskId: string, id: string, body: string) {
  await requireSeeTask(user, taskId);
  const comment = await getComment(taskId, id);
  if (comment.authorId !== user.id) {
    throw new HttpError(403, 'You can only edit your own comments');
  }
  return prisma.comment.update({ where: { id }, data: { body }, include: { author } });
}

export async function deleteComment(user: AuthUser, taskId: string, id: string) {
  await requireSeeTask(user, taskId);
  const comment = await getComment(taskId, id);
  if (comment.authorId !== user.id && user.role !== 'ADMIN') {
    throw new HttpError(403, 'You can only delete your own comments');
  }
  await prisma.comment.delete({ where: { id } });
}
