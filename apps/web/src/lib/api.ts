/** Tiny fetch wrapper. Requests go to /api/* which Vite proxies to the API in dev. */

const TOKEN_KEY = 'rb.token';

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
  /** Signed-in user from the JWT payload (not verified here; the API enforces access). */
  getUser: (): { id: string; email: string; role: Role } | null => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp && payload.exp * 1000 < Date.now()) return null;
      return { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      return null;
    }
  },
};

/** App roles from the scope plan's "Users and roles" table. */
export type Role = 'ADMIN' | 'DELIVERY_HEAD' | 'RESOURCE_MANAGER' | 'PM' | 'MEMBER';

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  DELIVERY_HEAD: 'Delivery head',
  RESOURCE_MANAGER: 'Resource manager',
  PM: 'Project manager',
  MEMBER: 'Team member',
};

/** Admins, delivery heads and resource managers maintain people, projects and staffing. */
export const canManageStaffing = () => {
  const role = auth.getUser()?.role;
  return role === 'ADMIN' || role === 'DELIVERY_HEAD' || role === 'RESOURCE_MANAGER';
};

/** Admins and PMs create tasks (PMs on the projects they own or are staffed on). */
/** Team members see only their own projects, tasks and figures (the API enforces it). */
export const isTeamMember = () => auth.getUser()?.role === 'MEMBER';

export const canCreateTasks = () => {
  const role = auth.getUser()?.role;
  return role === 'ADMIN' || role === 'PM';
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

/** Send the browser to a page outside React (used when the session is no longer usable). */
function leaveTo(path: string) {
  if (window.location.pathname !== path.split('?')[0]) window.location.assign(path);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = auth.getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    // Expired, invalid or deactivated session: sign in again and come back here.
    if (res.status === 401 && path !== '/auth/login') {
      auth.clear();
      const here = window.location.pathname + window.location.search;
      leaveTo(`/login?next=${encodeURIComponent(here)}`);
    }
    // A password set by someone else must be changed before anything else.
    if (res.status === 403 && body?.details?.code === 'PASSWORD_CHANGE_REQUIRED') {
      leaveTo('/account/password');
    }
    throw new ApiError(res.status, body?.error ?? res.statusText, body?.details);
  }
  return body as T;
}

// ---------- Shared response types (keep in sync with the API) ----------

export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';
export const TASK_STATUSES: TaskStatus[] = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'BLOCKED',
  'DONE',
];

export interface DashboardWindow {
  from: string;
  to: string;
  weeks: number;
  currentWeek: string;
}

export type UtilizationBand = 'low' | 'moderate' | 'healthy' | 'over';

export interface HeatmapCell {
  weekStart: string;
  hours: number;
  pct: number;
  band: UtilizationBand;
}

/** GET /dashboard/overview - every widget on the dashboard, from one load. */
export interface DashboardOverview {
  window: DashboardWindow;
  kpis: {
    teamSize: number;
    totalDemandHours: number;
    billableDemandHours: number;
    nonBillableDemandHours: number;
    underUtilized: number;
    overUtilized: number;
    onBench: number;
    unscheduledTasks: number;
    thresholds: { underUtilizedPct: number; overUtilizedPct: number };
  };
  demandVsAvailability: {
    weekStart: string;
    isCurrent: boolean;
    capacityHours: number;
    demandHours: number;
    unassignedHours: number;
    demandPct: number;
    availabilityPct: number;
  }[];
  departments: { department: string; hours: number; avgFtePerWeek: number }[];
  heatmap: {
    rows: {
      personId: string;
      name: string;
      title: string | null;
      department: string;
      capacityHours: number;
      cells: HeatmapCell[];
    }[];
    total: { capacityHours: number; cells: HeatmapCell[] };
  };
}

export interface Department {
  id: string;
  name: string;
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskType = 'STORY' | 'TASK' | 'BUG' | 'SUPPORT';

export interface Task {
  id: string;
  /** Display key, e.g. "RB-12". */
  key: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  order: number;
  estimateHours: string | null;
  loggedHours: number;
  startDate: string | null;
  dueDate: string | null;
  assignee: { id: string; name: string } | null;
  project: { id: string; code: string; name: string };
}

export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string | null;
  billable: boolean;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  owner: { id: string; name: string } | null;
  members: { id: string; name: string }[];
  openTasks: number;
  estimateHours: number;
  loggedHours: number;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  members: { isLead: boolean; person: { id: string; name: string; email: string } }[];
}

export interface Person {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  weeklyCapacityHours: string;
  department: { id: string; name: string } | null;
  projects: { id: string; code: string; name: string }[];
}
