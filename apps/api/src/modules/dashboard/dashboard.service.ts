import { prisma } from '../../lib/prisma.js';

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStartOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d;
}

/**
 * Simple KPI summary proving end-to-end wiring.
 * TODO(M1): replace with the six utilization KPIs, demand vs availability,
 * department donut and person x week heat map endpoints.
 */
export async function getSummary(now = new Date()) {
  const weekStart = weekStartOf(now);

  const [people, activeProjects, openTasks, tasksByStatus, capacity, allocated] = await Promise.all(
    [
      prisma.person.count({ where: { active: true } }),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.task.count({ where: { status: { not: 'DONE' } } }),
      prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.person.aggregate({ where: { active: true }, _sum: { weeklyCapacityHours: true } }),
      prisma.allocation.aggregate({ where: { weekStart }, _sum: { hours: true } }),
    ],
  );

  const capacityHours = Number(capacity._sum.weeklyCapacityHours ?? 0);
  const allocatedHours = Number(allocated._sum.hours ?? 0);

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    people,
    activeProjects,
    openTasks,
    capacityHours,
    allocatedHours,
    utilizationPct: capacityHours ? Math.round((allocatedHours / capacityHours) * 1000) / 10 : 0,
    tasksByStatus: Object.fromEntries(tasksByStatus.map((t) => [t.status, t._count._all])),
  };
}
