import { prisma } from '../../lib/prisma.js';
import { OVER_UTILIZED_PCT, UNDER_UTILIZED_PCT } from '../dashboard/utilization.js';

export interface Thresholds {
  underUtilizedPct: number;
  overUtilizedPct: number;
}

// Organisation-wide limits are the rows with no department or project.
const GLOBAL = { departmentId: null, projectId: null };

/** The configured limits, falling back to 70% and 100% when none are set (or one is off). */
export async function getThresholds(): Promise<Thresholds> {
  const rows = await prisma.alertThreshold.findMany({
    where: { ...GLOBAL, enabled: true, metric: { in: ['UNDER_UTILIZATION', 'OVER_ALLOCATION'] } },
    orderBy: { updatedAt: 'desc' },
  });
  const value = (metric: string) => rows.find((r) => r.metric === metric)?.value;
  return {
    underUtilizedPct: Number(value('UNDER_UTILIZATION') ?? UNDER_UTILIZED_PCT),
    overUtilizedPct: Number(value('OVER_ALLOCATION') ?? OVER_UTILIZED_PCT),
  };
}

export async function setThresholds(t: Thresholds): Promise<Thresholds> {
  await prisma.$transaction(async (tx) => {
    for (const [metric, value] of [
      ['UNDER_UTILIZATION', t.underUtilizedPct],
      ['OVER_ALLOCATION', t.overUtilizedPct],
    ] as const) {
      // One organisation-wide row per metric.
      await tx.alertThreshold.deleteMany({ where: { ...GLOBAL, metric } });
      await tx.alertThreshold.create({ data: { metric, value, enabled: true } });
    }
  });
  return getThresholds();
}
