import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { TaskPriority, TaskStatus, TaskType } from '../../generated/prisma/enums.js';

export interface TaskFilter {
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

/** Display key for a task, e.g. "RB-12". */
export const taskKey = (number: number) => `RB-${number}`;

export async function listTasks(filter: TaskFilter) {
  const tasks = await prisma.task.findMany({
    where: filter,
    orderBy: [{ status: 'asc' }, { order: 'asc' }],
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
    },
  });

  // Hours logged = sum of the task's worklogs.
  const logged = await prisma.worklog.groupBy({
    by: ['taskId'],
    where: { taskId: { in: tasks.map((t) => t.id) } },
    _sum: { hours: true },
  });
  const loggedByTask = new Map(logged.map((l) => [l.taskId, Number(l._sum.hours ?? 0)]));

  return tasks.map((t) => ({
    ...t,
    key: taskKey(t.number),
    loggedHours: loggedByTask.get(t.id) ?? 0,
  }));
}

// ---------- Permissions (Users and roles in the scope plan) ----------

/**
 * Admins manage every project; PMs manage the projects they own or are staffed on.
 * Members never manage, but may work on (move, log hours) tasks assigned to them.
 */
export async function canManageProject(user: AuthUser, projectId: string) {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'PM') return false;
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerId: user.id }, { members: { some: { personId: user.id } } }],
    },
    select: { id: true },
  });
  return project !== null;
}

async function getTask(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, projectId: true, assigneeId: true, status: true, order: true },
  });
  if (!task) throw new HttpError(404, 'Task not found');
  return task;
}

async function requireManage(user: AuthUser, projectId: string) {
  if (!(await canManageProject(user, projectId))) {
    throw new HttpError(403, 'Only an admin or a PM on this project can do that');
  }
}

/** Manage the project, or be the task's assignee. */
async function requireWork(user: AuthUser, task: { projectId: string; assigneeId: string | null }) {
  if (task.assigneeId === user.id) return;
  await requireManage(user, task.projectId);
}

/** The assignee must be staffed on the project, so utilization and staffing agree. */
async function requireMember(projectId: string, personId: string | null | undefined) {
  if (!personId) return;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_personId: { projectId, personId } },
    select: { personId: true },
  });
  if (!member) {
    throw new HttpError(400, 'The assignee is not a member of this project. Add them first.', {
      fieldErrors: { assigneeId: ['Not a member of this project'] },
    });
  }
}

async function nextOrder(projectId: string, status: TaskStatus) {
  const last = await prisma.task.aggregate({
    where: { projectId, status },
    _max: { order: true },
  });
  return (last._max.order ?? 0) + 1000;
}

// ---------- Writes ----------

export interface TaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  assigneeId?: string | null;
  estimateHours?: number | null;
  startDate?: Date | null;
  dueDate?: Date | null;
}

export async function createTask(user: AuthUser, input: TaskInput) {
  await requireManage(user, input.projectId);
  await requireMember(input.projectId, input.assigneeId);
  return prisma.task.create({
    data: { ...input, order: await nextOrder(input.projectId, input.status ?? 'TODO') },
  });
}

/** Fields a task's assignee may change without managing the project. */
const ASSIGNEE_FIELDS = new Set(['status']);

export async function updateTask(user: AuthUser, id: string, input: Partial<TaskInput>) {
  const task = await getTask(id);
  const manages = await canManageProject(user, task.projectId);
  if (!manages) {
    if (task.assigneeId !== user.id) await requireManage(user, task.projectId);
    if (!Object.keys(input).every((k) => ASSIGNEE_FIELDS.has(k))) {
      throw new HttpError(403, 'You can only change the status of tasks assigned to you');
    }
  }

  const projectId = input.projectId ?? task.projectId;
  if (input.projectId && input.projectId !== task.projectId) await requireManage(user, projectId);
  // Re-check membership when the assignee or the project changes.
  if (input.assigneeId !== undefined || input.projectId !== undefined) {
    const assigneeId = input.assigneeId !== undefined ? input.assigneeId : task.assigneeId;
    await requireMember(projectId, assigneeId);
  }

  // A task changing column (or project) goes to the bottom of its new column.
  const status = input.status ?? task.status;
  const moved = status !== task.status || projectId !== task.projectId;
  return prisma.task.update({
    where: { id },
    data: { ...input, ...(moved ? { order: await nextOrder(projectId, status) } : {}) },
  });
}

export async function deleteTask(user: AuthUser, id: string) {
  const task = await getTask(id);
  await requireManage(user, task.projectId);
  await prisma.task.delete({ where: { id } });
}

/** Move a task to a column/position (used by the drag-and-drop board). */
export async function moveTask(user: AuthUser, id: string, status: TaskStatus, order: number) {
  await requireWork(user, await getTask(id));
  return prisma.task.update({ where: { id }, data: { status, order } });
}

/** Log hours on a task as the signed-in person. */
export async function logWork(
  user: AuthUser,
  taskId: string,
  input: { hours: number; date: Date; note?: string | null },
) {
  await requireWork(user, await getTask(taskId));
  return prisma.worklog.create({ data: { ...input, taskId, personId: user.id } });
}
