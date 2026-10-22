import { prisma } from '../../lib/prisma.js';
import type { TaskStatus } from '../../generated/prisma/enums.js';

export interface TaskFilter {
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

export function listTasks(filter: TaskFilter) {
  return prisma.task.findMany({
    where: filter,
    orderBy: [{ status: 'asc' }, { order: 'asc' }],
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
    },
  });
}

/** Move a task to a column/position (used by the drag-and-drop board). */
export function moveTask(id: string, status: TaskStatus, order: number) {
  return prisma.task.update({ where: { id }, data: { status, order } });
}
