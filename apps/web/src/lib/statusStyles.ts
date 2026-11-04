import type { ProjectStatus, SprintStatus } from './api';

/** Project statuses in order, with their labels. */
export const PROJECT_STATUSES: [ProjectStatus, string][] = [
  ['PLANNED', 'Planned'],
  ['ACTIVE', 'Active'],
  ['ON_HOLD', 'On hold'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
];
export const PROJECT_STATUS_LABEL = Object.fromEntries(PROJECT_STATUSES) as Record<
  ProjectStatus,
  string
>;
export const PROJECT_STATUS_CLASS: Record<ProjectStatus, string> = {
  PLANNED: 'bg-blue-soft',
  ACTIVE: 'bg-green-soft',
  ON_HOLD: 'bg-amber-soft',
  COMPLETED: 'bg-panel2 border border-line',
  CANCELLED: 'bg-panel2 border border-line text-muted',
};

export const SPRINT_STATUS_CLASS: Record<SprintStatus, string> = {
  PLANNED: 'bg-blue-soft',
  ACTIVE: 'bg-amber-soft',
  CLOSED: 'bg-green-soft',
};
