import { prisma } from '../../lib/prisma.js';
import type { ProjectStatus } from '../../generated/prisma/enums.js';

export function listProjects() {
  return prisma.project.findMany({
    orderBy: { code: 'asc' },
    include: {
      owner: { select: { id: true, name: true } },
      _count: { select: { tasks: true, allocations: true } },
    },
  });
}

export interface CreateProjectInput {
  code: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  ownerId?: string;
}

export function createProject(input: CreateProjectInput) {
  return prisma.project.create({ data: input });
}
