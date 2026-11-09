import type { TaskPriority, TaskStatus, TaskType } from '../../generated/prisma/enums.js';
import type { AdfNode, JiraIssue, JiraIssueWrite, JiraStatus } from './jira.client.js';

/**
 * How a SedHub task and a JIRA issue correspond, field by field. Both sides are turned into the
 * same plain shape (SyncedFields, in SedHub terms) so the sync can compare them with the values
 * they last agreed on.
 */

export interface SyncedFields {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  /** A SedHub person id, "jira:<accountId>" for a JIRA user with no SedHub match, or null. */
  assignee: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** Sorted, lowercase, no spaces (SedHub's label rule). */
  labels: string[];
  estimateHours: number | null;
}

export const SYNCED: (keyof SyncedFields)[] = [
  'title',
  'description',
  'status',
  'priority',
  'type',
  'assignee',
  'dueDate',
  'labels',
  'estimateHours',
];

/** Field names for people (conflict lists, warnings). */
export const FIELD_LABEL: Record<keyof SyncedFields, string> = {
  title: 'Summary',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  type: 'Type',
  assignee: 'Assignee',
  dueDate: 'Due date',
  labels: 'Labels',
  estimateHours: 'Estimate',
};

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Text ----------

/** Line endings and outer blank space don't count as a change; empty means none. */
export const normaliseText = (s: string | null | undefined) => {
  const t = (s ?? '').replace(/\r\n?/g, '\n').trim();
  return t || null;
};

/** JIRA rich text as plain text: paragraphs and list items on their own lines. */
export function adfToText(node: AdfNode | null | undefined): string | null {
  if (!node) return null;
  const blocks: string[] = [];
  const inline = (n: AdfNode): string =>
    n.type === 'text'
      ? (n.text ?? '')
      : n.type === 'hardBreak'
        ? '\n'
        : n.type === 'mention'
          ? String(n.attrs?.text ?? '')
          : (n.content ?? []).map(inline).join('');
  const walk = (n: AdfNode, prefix = '') => {
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'codeBlock') {
      blocks.push(prefix + inline(n));
    } else if (n.type === 'listItem') {
      (n.content ?? []).forEach((c, i) => walk(c, i === 0 ? prefix : ''));
    } else if (n.type === 'bulletList' || n.type === 'orderedList') {
      (n.content ?? []).forEach((c, i) => walk(c, n.type === 'bulletList' ? '- ' : `${i + 1}. `));
    } else {
      (n.content ?? []).forEach((c) => walk(c, prefix));
    }
  };
  walk(node);
  return normaliseText(blocks.join('\n'));
}

/** Plain text as JIRA rich text: one paragraph per line. */
export function textToAdf(text: string | null): AdfNode | null {
  const t = normaliseText(text);
  if (!t) return null;
  return {
    type: 'doc',
    attrs: { version: 1 },
    content: t
      .split('\n')
      .map((line) =>
        line
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' },
      ),
  } as AdfNode;
}

// ---------- Status, priority, type ----------

const STATUS_BY_NAME: Record<string, TaskStatus> = {
  backlog: 'BACKLOG',
  'to do': 'TODO',
  todo: 'TODO',
  open: 'TODO',
  'selected for development': 'TODO',
  'in progress': 'IN_PROGRESS',
  'in review': 'IN_REVIEW',
  review: 'IN_REVIEW',
  'code review': 'IN_REVIEW',
  'in qa': 'IN_REVIEW',
  blocked: 'BLOCKED',
  'on hold': 'BLOCKED',
  done: 'DONE',
  closed: 'DONE',
  resolved: 'DONE',
};

/** A JIRA status in SedHub's columns: by name when it's a common one, else by its category. */
export function statusFromJira(s: JiraStatus): TaskStatus {
  const byName = STATUS_BY_NAME[s.name.trim().toLowerCase()];
  if (byName) return byName;
  const category = s.statusCategory?.key;
  return category === 'done' ? 'DONE' : category === 'indeterminate' ? 'IN_PROGRESS' : 'TODO';
}

const PRIORITY_FROM_JIRA: Record<string, TaskPriority> = {
  highest: 'CRITICAL',
  blocker: 'CRITICAL',
  critical: 'CRITICAL',
  high: 'HIGH',
  major: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  minor: 'LOW',
  lowest: 'LOW',
  trivial: 'LOW',
};
export const PRIORITY_TO_JIRA: Record<TaskPriority, string> = {
  CRITICAL: 'Highest',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const priorityFromJira = (p: { name: string } | null): TaskPriority =>
  (p && PRIORITY_FROM_JIRA[p.name.trim().toLowerCase()]) ?? 'MEDIUM';

export function typeFromJira(t: { name: string }): TaskType {
  const name = t.name.trim().toLowerCase();
  return name === 'story'
    ? 'STORY'
    : name === 'bug'
      ? 'BUG'
      : name === 'support'
        ? 'SUPPORT'
        : 'TASK';
}
/** JIRA has no Support type by default, so support tasks become Tasks there. */
export const TYPE_TO_JIRA: Record<TaskType, string> = {
  STORY: 'Story',
  BUG: 'Bug',
  TASK: 'Task',
  SUPPORT: 'Task',
};

/** SedHub's label rule (tasks.router.ts): lowercase, spaces become dashes. */
export const normaliseLabels = (labels: string[]) =>
  [
    ...new Set(
      labels.map((l) => l.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30)).filter(Boolean),
    ),
  ].sort();

const hours = (seconds: number | undefined) =>
  seconds === undefined || seconds === null ? null : Math.round((seconds / 3600) * 100) / 100;

// ---------- Whole issue / task ----------

/**
 * A JIRA issue in SedHub terms. `personOf` turns a JIRA account into a SedHub person id (or
 * null when nobody matches, which becomes "jira:<accountId>").
 */
export function fromIssue(issue: JiraIssue, personOf: (accountId: string) => string | null) {
  const f = issue.fields;
  const assignee = f.assignee
    ? (personOf(f.assignee.accountId) ?? `jira:${f.assignee.accountId}`)
    : null;
  return {
    title: f.summary.trim().slice(0, 200),
    description: adfToText(f.description),
    status: statusFromJira(f.status),
    priority: priorityFromJira(f.priority),
    type: typeFromJira(f.issuetype),
    assignee,
    dueDate: f.duedate ?? null,
    labels: normaliseLabels(f.labels ?? []),
    estimateHours: hours(f.timetracking?.originalEstimateSeconds),
  } satisfies SyncedFields;
}

export interface TaskRow {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  assigneeId: string | null;
  dueDate: Date | null;
  labels: string[];
  estimateHours: { toNumber(): number } | number | null;
}

/** A SedHub task in the same shape. */
export function fromTask(t: TaskRow): SyncedFields {
  return {
    title: t.title.trim(),
    description: normaliseText(t.description),
    status: t.status,
    priority: t.priority,
    type: t.type,
    assignee: t.assigneeId,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    labels: normaliseLabels(t.labels),
    estimateHours:
      t.estimateHours === null
        ? null
        : typeof t.estimateHours === 'number'
          ? t.estimateHours
          : t.estimateHours.toNumber(),
  };
}

/** Synced values as a SedHub task update (status, which needs completedAt, is left to the caller). */
export function toTaskData(v: Partial<SyncedFields>) {
  const data: Record<string, unknown> = {};
  if (v.title !== undefined) data.title = v.title;
  if (v.description !== undefined) data.description = v.description;
  if (v.priority !== undefined) data.priority = v.priority;
  if (v.type !== undefined) data.type = v.type;
  // A JIRA user with no SedHub match leaves the task unassigned here.
  if (v.assignee !== undefined)
    data.assigneeId = v.assignee?.startsWith('jira:') ? null : v.assignee;
  if (v.dueDate !== undefined) data.dueDate = v.dueDate ? new Date(`${v.dueDate}T00:00:00Z`) : null;
  if (v.labels !== undefined) data.labels = v.labels;
  if (v.estimateHours !== undefined) data.estimateHours = v.estimateHours;
  return data;
}

/**
 * Synced values as JIRA issue fields (status goes through a transition instead). `accountOf`
 * turns a SedHub person id into a JIRA account id; undefined = no JIRA account, leave it.
 */
export function toIssueFields(
  v: Partial<SyncedFields>,
  accountOf: (assignee: string) => string | undefined,
): JiraIssueWrite {
  const fields: JiraIssueWrite = {};
  if (v.title !== undefined) fields.summary = v.title;
  if (v.description !== undefined) fields.description = textToAdf(v.description);
  if (v.priority !== undefined) fields.priority = { name: PRIORITY_TO_JIRA[v.priority] };
  if (v.type !== undefined) fields.issuetype = { name: TYPE_TO_JIRA[v.type] };
  if (v.assignee !== undefined) {
    if (v.assignee === null) fields.assignee = null;
    else {
      const accountId = v.assignee.startsWith('jira:')
        ? v.assignee.slice(5)
        : accountOf(v.assignee);
      if (accountId) fields.assignee = { accountId };
    }
  }
  if (v.dueDate !== undefined) fields.duedate = v.dueDate;
  if (v.labels !== undefined) fields.labels = v.labels;
  // A removed estimate isn't cleared in JIRA (its API has no plain way to); JIRA keeps its own.
  if (v.estimateHours !== undefined && v.estimateHours !== null)
    fields.timetracking = { originalEstimate: `${Math.round(v.estimateHours * 60)}m` };
  return fields;
}
