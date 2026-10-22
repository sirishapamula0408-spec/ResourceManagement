import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  api,
  auth,
  type Person,
  type Project,
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

export interface TaskFilter {
  projectId: string;
  assigneeId: string;
  q: string;
}

// Shared between the Board and Tasks pages, like the prototype, so switching views keeps them.
let lastFilter: TaskFilter = { projectId: '', assigneeId: '', q: '' };

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
      (!q || `${t.title} ${t.key}`.toLowerCase().includes(q)),
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
