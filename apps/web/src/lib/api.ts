/** Tiny fetch wrapper. Requests go to /api/* which Vite proxies to the API in dev. */

const TOKEN_KEY = 'rb.token';

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = auth.getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText, body?.details);
  return body as T;
}

// ---------- Shared response types (keep in sync with the API) ----------

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';
export const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];

export interface DashboardSummary {
  weekStart: string;
  people: number;
  activeProjects: number;
  openTasks: number;
  capacityHours: number;
  allocatedHours: number;
  utilizationPct: number;
  tasksByStatus: Partial<Record<TaskStatus, number>>;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  order: number;
  estimateHours: string | null;
  assignee: { id: string; name: string } | null;
  project: { id: string; code: string; name: string };
}

export interface Project {
  id: string;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  owner: { id: string; name: string } | null;
  _count: { tasks: number; allocations: number };
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  members: { isLead: boolean; person: { id: string; name: string; email: string } }[];
}
