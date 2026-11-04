/** Tiny fetch wrapper. Requests go to /api/* which Vite proxies to the API in dev. */

const TOKEN_KEY = 'rb.token';

export const auth = {
  /** The session token: kept in localStorage when "Remember me" is on, else for this tab only. */
  getToken: () => localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY),
  setToken: (token: string, remember = true) => {
    auth.clear();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  },
  /** Signed-in user from the JWT payload (not verified here; the API enforces access). */
  getUser: (): { id: string; email: string; role: Role } | null => {
    const token = auth.getToken();
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

/** Response of sign-in and sign-up. */
export interface LoginResponse {
  token: string;
  user: { id: string; name: string; email: string; role: Role; mustChangePassword: boolean };
}

/** Only return to pages inside this app after signing in or up. */
export const safeNext = (next: string | null) =>
  next &&
  next.startsWith('/') &&
  !next.startsWith('//') &&
  !next.startsWith('/login') &&
  !next.startsWith('/signup')
    ? next
    : '/dashboard';

/** App roles from the scope plan's "Users and roles" table. */
export type Role = 'ADMIN' | 'DELIVERY_HEAD' | 'RESOURCE_MANAGER' | 'PM' | 'MEMBER' | 'SALES';

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  DELIVERY_HEAD: 'Delivery head',
  RESOURCE_MANAGER: 'Resource manager',
  PM: 'Project manager',
  MEMBER: 'Team member',
  SALES: 'Sales',
};

/** Admins, delivery heads and resource managers maintain people, projects and staffing. */
export const canManageStaffing = () => {
  const role = auth.getUser()?.role;
  return role === 'ADMIN' || role === 'DELIVERY_HEAD' || role === 'RESOURCE_MANAGER';
};

/** Sales users work leads and see a read-only project list; nothing else (API-enforced). */
export const isSales = () => auth.getUser()?.role === 'SALES';

/** Same lists as LEAD_VIEW_ROLES / LEAD_EDIT_ROLES in the API. */
export const canViewLeads = () =>
  ['ADMIN', 'SALES', 'DELIVERY_HEAD', 'PM'].includes(auth.getUser()?.role ?? '');
export const canEditLeads = () => ['ADMIN', 'SALES'].includes(auth.getUser()?.role ?? '');

/** Team members see only their own projects, tasks and figures (the API enforces it). */
export const isTeamMember = () => auth.getUser()?.role === 'MEMBER';

/** Admins and PMs create tasks (PMs on the projects they own or are staffed on). */
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
    // (Not for the sign-in steps themselves: there a 401 means a wrong password or code.)
    if (res.status === 401 && path !== '/auth/login' && !path.startsWith('/auth/mfa/')) {
      auth.clear();
      const here = window.location.pathname + window.location.search;
      const reason = token ? 'reason=expired&' : '';
      leaveTo(`/login?${reason}next=${encodeURIComponent(here)}`);
    }
    // A password set by someone else must be changed before anything else.
    if (res.status === 403 && body?.details?.code === 'PASSWORD_CHANGE_REQUIRED') {
      leaveTo('/account/password');
    }
    throw new ApiError(res.status, body?.error ?? res.statusText, body?.details);
  }
  return body as T;
}

/**
 * Download a file the API serves to signed-in users (e.g. an attachment): fetched with the
 * session token, then saved through a short-lived object URL under its own name.
 */
export async function downloadFile(path: string, name: string) {
  const token = auth.getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(res.status, body?.error ?? res.statusText, body?.details);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Send a file as the raw request body (the API's upload format), reporting progress from 0 to 1.
 * XMLHttpRequest rather than fetch, because fetch can't report upload progress.
 */
export function uploadFile<T>(path: string, file: File, onProgress?: (share: number) => void) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    const token = auth.getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string; details?: unknown } | undefined;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, body?.error ?? xhr.statusText, body?.details));
    };
    xhr.onerror = () =>
      reject(new Error('The upload failed. Check your connection and try again.'));
    xhr.send(file);
  });
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
  /** Display key: project code and the task's number on that project, e.g. "ATLAS-12". */
  key: string;
  /** The task's number on its project (the digits in the key). */
  number: number;
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
  sprint: { id: string; name: string; status: SprintStatus } | null;
  epic: { id: string; name: string; color: string | null } | null;
  commentCount: number;
  /** Lowercase labels, e.g. ["frontend", "customer-request"]. */
  labels: string[];
  /** Set when this is a sub-task. */
  parent: { id: string; key: string; title: string } | null;
  subtaskCount: number;
  createdAt: string;
  updatedAt: string;
  /** Tasks that block this one and are not done yet. */
  openBlockers: number;
}

/** One entry in a task's history: who did what, when, and the fields that changed. */
export interface TaskHistoryEntry {
  id: string;
  action: 'create' | 'update' | 'delete' | 'worklog' | 'attach' | 'detach';
  at: string;
  actor: { id: string; name: string } | null;
  changes: { field: string; from: unknown; to: unknown }[];
  hours: number | null;
  /** File name, for attachments added or removed. */
  attachment: string | null;
}

/** A file attached to a task. */
export interface Attachment {
  id: string;
  taskId: string;
  name: string;
  mimeType: string;
  /** Bytes. */
  size: number;
  createdAt: string;
  uploader: { id: string; name: string } | null;
}

/** GET /tasks/:id/attachments: newest first, with the largest upload the API accepts. */
export interface AttachmentList {
  attachments: Attachment[];
  maxBytes: number;
}

export type LinkKind = 'BLOCKS' | 'BLOCKED_BY' | 'RELATES';

/** A link as seen from one task: "this task <kind> <task>". */
export interface TaskLink {
  id: string;
  kind: LinkKind;
  task: { id: string; key: string; title: string; status: TaskStatus };
}

/** A label in use and how many tasks carry it. */
export interface LabelCount {
  name: string;
  tasks: number;
}

/** A comment on a task. */
export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  author: { id: string; name: string };
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED';

/** A sprint on one project, with its task counts. */
export interface Sprint {
  id: string;
  projectId: string;
  project: { id: string; code: string; name: string };
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  tasks: number;
  done: number;
}

/** An epic on one project, with its task counts. */
export interface Epic {
  id: string;
  projectId: string;
  project: { id: string; code: string; name: string };
  name: string;
  description: string | null;
  color: string | null;
  tasks: number;
  done: number;
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

export type Rag = 'green' | 'amber' | 'red';

export interface ReportTask {
  key: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  dueDate: string | null;
  completedAt: string | null;
  estimateHours: number;
}

export interface ProjectReport {
  project: {
    id: string;
    code: string;
    name: string;
    client: string | null;
    billable: boolean;
    status: ProjectStatus;
    owner: string | null;
  };
  health: { rag: Rag; reasons: string[] };
  metrics: {
    completed: number;
    open: number;
    inProgress: number;
    blocked: number;
    overdue: number;
    plannedHours: number;
    loggedHours: number;
    estimateToDate: number;
    loggedToDate: number;
  };
  completed: ReportTask[];
  inProgress: ReportTask[];
  dueNext: ReportTask[];
  blocked: ReportTask[];
  overdue: ReportTask[];
  team: { name: string; loggedHours: number; plannedHours: number }[];
}

/** GET /reports/status - weekly or monthly project status report. */
export interface StatusReport {
  period: {
    type: 'week' | 'month';
    start: string;
    end: string;
    label: string;
    previous: string;
    next: string;
    nextLabel: string;
    asOf: string;
  };
  generatedAt: string;
  totals: {
    projects: number;
    red: number;
    amber: number;
    green: number;
    completed: number;
    loggedHours: number;
    plannedHours: number;
    overdue: number;
    blocked: number;
  };
  projects: ProjectReport[];
}

export type LeadStage =
  'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type LeadPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type LeadSource = 'REFERRAL' | 'WEBSITE' | 'EVENT' | 'OUTBOUND' | 'PARTNER' | 'OTHER';

export interface Lead {
  id: string;
  company: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  source: LeadSource;
  stage: LeadStage;
  priority: LeadPriority;
  /** INR, as a decimal string. */
  estimatedValue: string | null;
  expectedCloseDate: string | null;
  nextFollowUp: string | null;
  notes: string | null;
  lostReason: string | null;
  owner: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}
