import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  api,
  auth,
  type Person,
  type Epic,
  type LabelCount,
  type Project,
  type Sprint,
  type SprintStatus,
  type Task,
  type TaskStatus,
  type TaskType,
} from '../../lib/api';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  BLOCKED: 'Blocked',
  DONE: 'Done',
};

export type Priority = Task['priority'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

/** Highest first, for sorting. */
export const PRIORITY_RANK: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Overdue = due date before today and not done. */
export const isOverdue = (t: Task) =>
  t.status !== 'DONE' && !!t.dueDate && t.dueDate.slice(0, 10) < todayIso();

/** Short "22 Oct" date for task due dates (UTC calendar days). */
export const dueLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const hours = (n: string | number | null) => Number(n ?? 0);

/** People and projects for filters, avatars and project colours. */
export function useTaskLookups() {
  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => api<Person[]>('/people'),
    // Sales users have no access to people (they only see leads and the project list).
    enabled: auth.getUser()?.role !== 'SALES',
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  return {
    people,
    projects,
    personNames: people.map((p) => p.name),
    projectCodes: projects.map((p) => p.code),
  };
}

/** Sprints and epics for filters, the task dialog and the Sprints page. */
export function usePlanningLookups() {
  const enabled = auth.getUser()?.role !== 'SALES';
  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints'],
    queryFn: () => api<Sprint[]>('/sprints'),
    enabled,
  });
  const { data: epics = [] } = useQuery({
    queryKey: ['epics'],
    queryFn: () => api<Epic[]>('/epics'),
    enabled,
  });
  return { sprints, epics };
}

/** Labels in use, most used first (suggestions and the label filter). */
export function useLabels() {
  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => api<LabelCount[]>('/tasks/labels'),
    enabled: auth.getUser()?.role !== 'SALES',
  });
  return labels;
}

/** The API's label rule: one lowercase word, spaces become dashes. */
export const normalizeLabel = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);

export const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  CLOSED: 'Complete',
};

/** Filter value for tasks in no sprint (the backlog) or with no epic. */
export const NONE = 'none';

export interface TaskFilter {
  projectId: string;
  assigneeId: string;
  /** A sprint id, NONE, or '' for any. */
  sprintId: string;
  /** An epic id, NONE, or '' for any. */
  epicId: string;
  /** A label, or '' for any. */
  label: string;
  q: string;
}

const EMPTY_FILTER: TaskFilter = {
  projectId: '',
  assigneeId: '',
  sprintId: '',
  epicId: '',
  label: '',
  q: '',
};

// Shared between the Board and Tasks pages, like the prototype, so switching views keeps them.
let lastFilter: TaskFilter = EMPTY_FILTER;

/** Open the Board or Tasks page on one sprint or epic (used by the Sprints page). */
export function presetTaskFilter(patch: Partial<TaskFilter>) {
  lastFilter = { ...EMPTY_FILTER, ...patch };
}

export function useTaskFilter() {
  const [filter, setFilter] = useState<TaskFilter>(lastFilter);
  useEffect(() => {
    lastFilter = filter;
  }, [filter]);
  return [filter, setFilter] as const;
}

export function applyTaskFilter(tasks: Task[], f: TaskFilter) {
  const q = f.q.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (!f.projectId || t.project.id === f.projectId) &&
      (!f.assigneeId || t.assignee?.id === f.assigneeId) &&
      (!f.sprintId || (f.sprintId === NONE ? !t.sprint : t.sprint?.id === f.sprintId)) &&
      (!f.epicId || (f.epicId === NONE ? !t.epic : t.epic?.id === f.epicId)) &&
      (!f.label || t.labels.includes(f.label)) &&
      (!q || `${t.title} ${t.key} ${t.labels.join(' ')}`.toLowerCase().includes(q)),
  );
}

/** Message for the Toast component; clears itself after a few seconds. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(timer);
  }, [message]);
  return [message, setMessage] as const;
}

export const TYPE_LABEL: Record<TaskType, string> = {
  STORY: 'Story',
  TASK: 'Task',
  BUG: 'Bug',
  SUPPORT: 'Support',
};

/** The filter last used on the Board or Tasks page, to pre-fill a new task. */
export const currentTaskFilter = () => lastFilter;

/**
 * Mirrors the API's rules so the UI only offers what will be allowed:
 * admins manage everything, PMs manage projects they own or are staffed on,
 * and an assignee may change the status of, and log hours on, their own task.
 */
export function useTaskPermissions() {
  const { projects } = useTaskLookups();
  const me = auth.getUser();
  const canManageProject = (projectId: string) => {
    if (!me) return false;
    if (me.role === 'ADMIN') return true;
    if (me.role !== 'PM') return false;
    const p = projects.find((x) => x.id === projectId);
    return !!p && (p.owner?.id === me.id || p.members.some((m) => m.id === me.id));
  };
  return {
    me,
    canManageProject,
    canWork: (t: Task) => !!me && (t.assignee?.id === me.id || canManageProject(t.project.id)),
    manageableProjects: projects.filter((p) => canManageProject(p.id)),
  };
}
