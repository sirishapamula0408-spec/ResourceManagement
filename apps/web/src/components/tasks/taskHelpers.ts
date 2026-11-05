import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

export const EMPTY_FILTER: TaskFilter = {
  projectId: '',
  assigneeId: '',
  sprintId: '',
  epicId: '',
  label: '',
  q: '',
};

// The filter last used on the Board or Tasks page: pages opened without filters in their address
// pick it up, so switching between them keeps it, and new tasks are pre-filled from it.
let lastFilter: TaskFilter = EMPTY_FILTER;
const rememberFilter = (f: TaskFilter) => {
  lastFilter = f;
};

// The project space open on screen, if any: new tasks default to it.
let projectContext: string | null = null;
export const setProjectContext = (projectId: string | null) => {
  projectContext = projectId;
};
export const currentProjectContext = () => projectContext;

/** Filter fields and their names in the page address, e.g. /board?sprint=…&label=ui. */
const URL_KEYS: [keyof TaskFilter, string][] = [
  ['projectId', 'project'],
  ['assigneeId', 'assignee'],
  ['sprintId', 'sprint'],
  ['epicId', 'epic'],
  ['label', 'label'],
  ['q', 'q'],
];

/** The filter fields present in a query string (absent ones are left out). */
export function readFilter(params: URLSearchParams): Partial<TaskFilter> {
  const out: Partial<TaskFilter> = {};
  for (const [field, key] of URL_KEYS) {
    const v = params.get(key);
    if (v !== null) out[field] = v;
  }
  return out;
}

/**
 * A filter as a query string: empty fields are left out, except an empty sprint inside a project
 * ("all sprints", as opposed to the default active sprint); the project is left out there too.
 */
export function writeFilter(f: TaskFilter, scoped = false) {
  const params = new URLSearchParams();
  for (const [field, key] of URL_KEYS) {
    if (scoped && field === 'projectId') continue;
    if (f[field] || (scoped && field === 'sprintId')) params.set(key, f[field]);
  }
  return params;
}

const isEmptyFilter = (f: TaskFilter) => URL_KEYS.every(([field]) => !f[field]);

/**
 * Filters for the Board and Tasks pages, kept in the page address so a refresh, the back button
 * and a shared link all show the same view. Inside a project space the filter is fixed to that
 * project and starts on its active sprint, as a JIRA board does.
 */
export function useScopedTaskFilter(projectId: string | undefined, activeSprintId?: string) {
  const [params, setParams] = useSearchParams();
  const scoped = !!projectId;
  const present = readFilter(params);
  const inAddress = Object.keys(present).length > 0;

  const filter: TaskFilter = scoped
    ? { ...EMPTY_FILTER, sprintId: activeSprintId ?? '', ...present, projectId }
    : { ...EMPTY_FILTER, ...(inAddress ? present : lastFilter) };

  // Opened without filters in the address: show the last ones there too.
  const carryOver = !scoped && !inAddress && !isEmptyFilter(lastFilter);
  useEffect(() => {
    if (carryOver) setParams(writeFilter(lastFilter), { replace: true });
  }, [carryOver, setParams]);
  if (!scoped) rememberFilter(filter);

  const setFilter = (next: TaskFilter) => {
    if (!scoped) rememberFilter(next);
    setParams(writeFilter(next, scoped), { replace: true });
  };
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
    // Viewers never work on tasks (they can't be assignees either; the API refuses both).
    canWork: (t: Task) =>
      !!me && me.role !== 'VIEWER' && (t.assignee?.id === me.id || canManageProject(t.project.id)),
    manageableProjects: projects.filter((p) => canManageProject(p.id)),
  };
}
