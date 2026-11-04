import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { TaskPriority, TaskStatus, TaskType } from '../../generated/prisma/enums.js';
import { removeFiles } from '../../lib/storage.js';
import { notifyAssigned, notifyStatus } from '../notifications/notifications.service.js';
import { storageKeysOf } from './attachments.service.js';
import { record, trackedSelect } from './history.service.js';

export interface TaskFilter {
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus;
  sprintId?: string;
  epicId?: string;
  /** Tasks carrying this label. */
  label?: string;
}

/** Display key for a task: its project's code and its number on that project, e.g. "ATLAS-12". */
export const taskKey = (projectCode: string, number: number) => `${projectCode}-${number}`;

/** Reserve the next task number on a project (one atomic update, so concurrent creates differ). */
export async function nextTaskNumber(projectId: string) {
  const { lastTaskNumber } = await prisma.project.update({
    where: { id: projectId },
    data: { lastTaskNumber: { increment: 1 } },
    select: { lastTaskNumber: true },
  });
  return lastTaskNumber;
}

/** A team member sees the tasks on their projects (their board) plus any assigned to them. */
export interface TaskScope {
  projectIds: string[];
  personId: string;
}

/** Where clause for a team member: their projects' tasks plus any assigned to them. */
const inScope = (scope: TaskScope | null) =>
  scope ? { OR: [{ projectId: { in: scope.projectIds } }, { assigneeId: scope.personId }] } : {};

export async function listTasks({ label, ...filter }: TaskFilter, scope: TaskScope | null = null) {
  const tasks = await prisma.task.findMany({
    where: { ...filter, ...(label ? { labels: { has: label } } : {}), ...inScope(scope) },
    orderBy: [{ status: 'asc' }, { order: 'asc' }],
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
      sprint: { select: { id: true, name: true, status: true } },
      epic: { select: { id: true, name: true, color: true } },
      parent: {
        select: { id: true, number: true, title: true, project: { select: { code: true } } },
      },
      _count: {
        select: {
          comments: true,
          subtasks: true,
          // Open blockers: tasks that block this one and are not done.
          linksIn: { where: { type: 'BLOCKS', from: { status: { not: 'DONE' } } } },
        },
      },
    },
  });

  // Hours logged = sum of the task's worklogs.
  const logged = await prisma.worklog.groupBy({
    by: ['taskId'],
    where: { taskId: { in: tasks.map((t) => t.id) } },
    _sum: { hours: true },
  });
  const loggedByTask = new Map(logged.map((l) => [l.taskId, Number(l._sum.hours ?? 0)]));

  return tasks.map(({ _count, parent, ...t }) => ({
    ...t,
    parent: parent && {
      id: parent.id,
      key: taskKey(parent.project.code, parent.number),
      title: parent.title,
    },
    commentCount: _count.comments,
    subtaskCount: _count.subtasks,
    openBlockers: _count.linksIn,
    key: taskKey(t.project.code, t.number),
    loggedHours: loggedByTask.get(t.id) ?? 0,
  }));
}

/** Every label in use, most used first, for suggestions and the label filter. */
export async function listLabels(scope: TaskScope | null = null) {
  const tasks = await prisma.task.findMany({
    where: { labels: { isEmpty: false }, ...inScope(scope) },
    select: { labels: true },
  });
  const counts = new Map<string, number>();
  for (const t of tasks) for (const l of t.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts]
    .map(([name, tasks]) => ({ name, tasks }))
    .sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name));
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

/** A task's sprint and epic must be on the task's own project (and the sprint not complete). */
async function requirePlanning(
  projectId: string,
  input: { sprintId?: string | null; epicId?: string | null },
) {
  const fieldErrors: Record<string, string[]> = {};
  if (input.sprintId) {
    const s = await prisma.sprint.findUnique({
      where: { id: input.sprintId },
      select: { projectId: true, status: true },
    });
    if (!s || s.projectId !== projectId) fieldErrors.sprintId = ['Not a sprint on this project'];
    else if (s.status === 'CLOSED') fieldErrors.sprintId = ['This sprint is complete'];
  }
  if (input.epicId) {
    const e = await prisma.epic.findUnique({
      where: { id: input.epicId },
      select: { projectId: true },
    });
    if (!e || e.projectId !== projectId) fieldErrors.epicId = ['Not an epic on this project'];
  }
  const fields = Object.keys(fieldErrors);
  if (fields.length) {
    throw new HttpError(400, Object.values(fieldErrors)[0][0], { fieldErrors });
  }
}

/**
 * Sub-tasks are one level deep, as in JIRA: the parent is on the same project and is not itself
 * a sub-task, and a task that has sub-tasks cannot become one.
 */
async function requireParent(
  projectId: string,
  parentId: string | null | undefined,
  selfId?: string,
) {
  if (!parentId) return;
  const fail = (message: string) => {
    throw new HttpError(400, message, { fieldErrors: { parentId: [message] } });
  };
  if (parentId === selfId) fail('A task cannot be its own parent');
  const parent = await prisma.task.findUnique({
    where: { id: parentId },
    select: { projectId: true, parentId: true },
  });
  if (!parent || parent.projectId !== projectId)
    fail('The parent must be a task on the same project');
  if (parent!.parentId) fail('A sub-task cannot have sub-tasks of its own');
  if (selfId && (await prisma.task.count({ where: { parentId: selfId } }))) {
    fail('This task has sub-tasks, so it cannot become a sub-task');
  }
}

/** Completion date follows the status: set on moving to Done, cleared when reopened. */
function completion(from: TaskStatus | undefined, to: TaskStatus) {
  if (to === 'DONE' && from !== 'DONE') return { completedAt: new Date() };
  if (to !== 'DONE' && from === 'DONE') return { completedAt: null };
  return {};
}

/** Bottom of a board column; the board mixes projects, so the rank is column-wide. */
async function nextOrder(status: TaskStatus) {
  const last = await prisma.task.aggregate({
    where: { status },
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
  sprintId?: string | null;
  epicId?: string | null;
  labels?: string[];
  /** Parent task, making this a sub-task. */
  parentId?: string | null;
}

export async function createTask(user: AuthUser, input: TaskInput) {
  await requireManage(user, input.projectId);
  await requireMember(input.projectId, input.assigneeId);
  await requirePlanning(input.projectId, input);
  await requireParent(input.projectId, input.parentId);
  const created = await prisma.task.create({
    data: {
      ...input,
      ...(input.labels ? { labels: [...new Set(input.labels)] } : {}),
      ...completion(undefined, input.status ?? 'TODO'),
      order: await nextOrder(input.status ?? 'TODO'),
      number: await nextTaskNumber(input.projectId),
      createdById: user.id,
    },
  });
  await record(user.id, created.id, 'task.create', null, {
    title: created.title,
    status: created.status,
  });
  await notifyAssigned(user.id, created.id, created.assigneeId);
  return created;
}

const changesProjectOf = (task: { projectId: string }, projectId: string) =>
  projectId !== task.projectId;

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

  // Sprints and epics belong to one project: moving a task to another project drops them
  // unless new ones are given.
  const planning = {
    sprintId:
      input.sprintId !== undefined
        ? input.sprintId
        : projectId !== task.projectId
          ? null
          : undefined,
    epicId:
      input.epicId !== undefined ? input.epicId : projectId !== task.projectId ? null : undefined,
  };
  await requirePlanning(projectId, planning);

  // A sub-task stays on its parent's project: moving project drops the link, and a parent
  // cannot move away from its sub-tasks.
  const parentId =
    input.parentId !== undefined
      ? input.parentId
      : changesProjectOf(task, projectId)
        ? null
        : undefined;
  if (changesProjectOf(task, projectId) && (await prisma.task.count({ where: { parentId: id } }))) {
    throw new HttpError(
      400,
      'Move or detach its sub-tasks before moving this task to another project',
    );
  }
  await requireParent(projectId, parentId, id);

  // A task changing column (or project) goes to the bottom of its new column; a task moved to
  // another project takes the next key there.
  const status = input.status ?? task.status;
  const changesProject = projectId !== task.projectId;
  const moved = status !== task.status || changesProject;
  const before = await prisma.task.findUniqueOrThrow({ where: { id }, select: trackedSelect });
  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...input,
      ...(input.labels ? { labels: [...new Set(input.labels)] } : {}),
      ...planning,
      parentId,
      ...completion(task.status, status),
      ...(moved ? { order: await nextOrder(status) } : {}),
      ...(changesProject ? { number: await nextTaskNumber(projectId) } : {}),
    },
  });
  await record(user.id, id, 'task.update', before, updated);
  // Tell a new assignee; otherwise tell the assignee when someone else changes the status.
  const reassigned = updated.assigneeId !== before.assigneeId;
  if (reassigned) await notifyAssigned(user.id, id, updated.assigneeId);
  else if (updated.status !== before.status) {
    await notifyStatus(user.id, updated, before.status, updated.status);
  }
  return updated;
}

export async function deleteTask(user: AuthUser, id: string) {
  const task = await getTask(id);
  await requireManage(user, task.projectId);
  // Attachment rows go with the task (cascade); their files are removed from disk after.
  const files = await storageKeysOf([id]);
  const gone = await prisma.task.delete({ where: { id } });
  await removeFiles(files);
  await record(user.id, id, 'task.delete', { title: gone.title, status: gone.status }, null);
}

/**
 * Delete several tasks at once. All or nothing: if any task is missing or the user may not
 * delete it, nothing is deleted and the error names the tasks concerned.
 */
export async function deleteTasks(user: AuthUser, ids: string[]) {
  const unique = [...new Set(ids)];
  const tasks = await prisma.task.findMany({
    where: { id: { in: unique } },
    select: { id: true, number: true, projectId: true, project: { select: { code: true } } },
  });
  if (tasks.length !== unique.length) {
    throw new HttpError(404, 'Some of the selected tasks no longer exist. Refresh and try again.');
  }

  // One permission check per project, not per task.
  const allowed = new Map<string, boolean>();
  for (const projectId of new Set(tasks.map((t) => t.projectId))) {
    allowed.set(projectId, await canManageProject(user, projectId));
  }
  const refused = tasks
    .filter((t) => !allowed.get(t.projectId))
    .map((t) => taskKey(t.project.code, t.number));
  if (refused.length) {
    throw new HttpError(
      403,
      `You can’t delete ${refused.join(', ')}. Only an admin or a PM on the task’s project can. Nothing was deleted.`,
      { refused },
    );
  }

  const snapshots = await prisma.task.findMany({
    where: { id: { in: unique } },
    select: { id: true, title: true, status: true },
  });
  const files = await storageKeysOf(unique);
  const { count } = await prisma.task.deleteMany({ where: { id: { in: unique } } });
  await removeFiles(files);
  for (const t of snapshots) {
    await record(user.id, t.id, 'task.delete', { title: t.title, status: t.status }, null);
  }
  return { deleted: count };
}

/** Where a dragged card lands: an explicit order, or between two neighbouring cards. */
export interface MovePlace {
  order?: number;
  /** The card that ends up just above it (null = top of the column). */
  afterId?: string | null;
  /** The card that ends up just below it (null = bottom of the column). */
  beforeId?: string | null;
}

const PRIORITY_RANK: Record<TaskPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Board order within a column: rank, then priority, due date and number (as the board draws it). */
const byBoardOrder = (
  a: { order: number; priority: TaskPriority; dueDate: Date | null; number: number },
  b: typeof a,
) =>
  a.order - b.order ||
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
  a.number - b.number;

/** Renumber a column 1000, 2000, ... in board order, leaving room between every card. */
async function spreadColumn(status: TaskStatus, exceptId: string) {
  const column = await prisma.task.findMany({
    where: { status, id: { not: exceptId } },
    select: { id: true, order: true, priority: true, dueDate: true, number: true },
  });
  column.sort(byBoardOrder);
  await prisma.$transaction(
    column.map((t, i) =>
      prisma.task.update({ where: { id: t.id }, data: { order: (i + 1) * 1000 } }),
    ),
  );
}

/** An order value between the two neighbours, renumbering the column once if they are too close. */
async function orderBetween(
  status: TaskStatus,
  id: string,
  afterId: string | null,
  beforeId: string | null,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [after, before] = await Promise.all(
      [afterId, beforeId].map((n) =>
        n
          ? prisma.task.findUnique({ where: { id: n }, select: { order: true, status: true } })
          : null,
      ),
    );
    if ((afterId && !after) || (beforeId && !before)) throw new HttpError(404, 'Task not found');
    if ((after && after.status !== status) || (before && before.status !== status)) {
      throw new HttpError(400, 'Neighbouring cards must be in the target column');
    }
    if (!after && !before) return nextOrder(status);
    if (!after) return before!.order - 1000;
    if (!before) return after.order + 1000;
    if (before.order - after.order >= 2) return Math.floor((after.order + before.order) / 2);
    await spreadColumn(status, id);
  }
  throw new HttpError(409, 'Could not place the card. Refresh the board and try again.');
}

/** Move a task to a column/position (used by the drag-and-drop board). */
export async function moveTask(user: AuthUser, id: string, status: TaskStatus, place: MovePlace) {
  const task = await getTask(id);
  await requireWork(user, task);
  const order =
    place.order ?? (await orderBetween(status, id, place.afterId ?? null, place.beforeId ?? null));
  const moved = await prisma.task.update({
    where: { id },
    data: { status, order, ...completion(task.status, status) },
  });
  await record(user.id, id, 'task.update', { status: task.status }, { status });
  if (status !== task.status) await notifyStatus(user.id, moved, task.status, status);
  return moved;
}

/** Log hours on a task as the signed-in person. */
export async function logWork(
  user: AuthUser,
  taskId: string,
  input: { hours: number; date: Date; note?: string | null },
) {
  await requireWork(user, await getTask(taskId));
  const worklog = await prisma.worklog.create({ data: { ...input, taskId, personId: user.id } });
  await record(user.id, taskId, 'task.worklog', null, { hours: input.hours });
  return worklog;
}
