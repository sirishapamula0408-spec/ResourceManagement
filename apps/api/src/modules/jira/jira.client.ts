import { config } from '../../config.js';

/**
 * The parts of the Jira Cloud REST API (v3) the sync uses, behind an interface so tests can run
 * the sync against an in-memory JIRA (test/jira.fake.ts).
 */

/** An Atlassian Document Format node (JIRA's rich text); only text is synced. */
export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
}

export interface JiraUser {
  accountId: string;
  displayName?: string;
  /** Only present when the person's profile lets the API see it. */
  emailAddress?: string;
}

export interface JiraStatus {
  name: string;
  statusCategory?: { key: string };
}

/** The issue fields the sync reads. */
export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description: AdfNode | null;
    status: JiraStatus;
    priority: { name: string } | null;
    issuetype: { name: string; subtask?: boolean };
    assignee: JiraUser | null;
    duedate: string | null;
    labels: string[];
    timetracking?: { originalEstimateSeconds?: number } | null;
    /** ISO timestamp of the last change. */
    updated: string;
  };
}

export const ISSUE_FIELDS = [
  'summary',
  'description',
  'status',
  'priority',
  'issuetype',
  'assignee',
  'duedate',
  'labels',
  'timetracking',
  'updated',
];

/** Fields the sync writes; any may be left out. */
export interface JiraIssueWrite {
  summary?: string;
  description?: AdfNode | null;
  priority?: { name: string };
  issuetype?: { name: string };
  assignee?: { accountId: string } | null;
  duedate?: string | null;
  labels?: string[];
  timetracking?: { originalEstimate: string };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
}

export interface JiraClient {
  /** Issues in a project updated at or after `since` (all of them when since is null). */
  searchIssues(projectKey: string, since: Date | null): Promise<JiraIssue[]>;
  getIssue(key: string): Promise<JiraIssue>;
  createIssue(projectKey: string, fields: JiraIssueWrite): Promise<{ key: string }>;
  updateIssue(key: string, fields: JiraIssueWrite): Promise<void>;
  transitions(key: string): Promise<JiraTransition[]>;
  transition(key: string, transitionId: string): Promise<void>;
  /** People whose name or email matches; used to find a SedHub person's JIRA account. */
  findUsers(query: string): Promise<JiraUser[]>;
}

/** A JIRA error with the HTTP status and, for 400s, which fields JIRA refused. */
export class JiraError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** JQL's date format, in UTC ("yyyy-MM-dd HH:mm"; JQL has no seconds). */
const jqlDate = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

/** The client for a real Jira Cloud site, using basic auth with an API token. */
export class HttpJiraClient implements JiraClient {
  private readonly auth: string;

  constructor(
    private readonly baseUrl: string,
    email: string,
    apiToken: string,
  ) {
    this.auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: {
        Authorization: this.auth,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const messages = [...(json?.errorMessages ?? []), ...Object.values(json?.errors ?? {})];
      throw new JiraError(
        res.status,
        `JIRA ${method} ${path} failed (${res.status})${messages.length ? `: ${messages.join('; ')}` : ''}`,
        json?.errors ?? {},
      );
    }
    return json as T;
  }

  async searchIssues(projectKey: string, since: Date | null) {
    const jql =
      `project = "${projectKey}"` +
      (since ? ` AND updated >= "${jqlDate(since)}"` : '') +
      ' ORDER BY updated ASC';
    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    do {
      const page = await this.call<{ issues: JiraIssue[]; nextPageToken?: string }>(
        'POST',
        '/rest/api/3/search/jql',
        { jql, fields: ISSUE_FIELDS, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) },
      );
      issues.push(...page.issues);
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
    return issues;
  }

  getIssue(key: string) {
    return this.call<JiraIssue>(
      'GET',
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${ISSUE_FIELDS.join(',')}`,
    );
  }

  createIssue(projectKey: string, fields: JiraIssueWrite) {
    return this.call<{ key: string }>('POST', '/rest/api/3/issue', {
      fields: { project: { key: projectKey }, ...fields },
    });
  }

  updateIssue(key: string, fields: JiraIssueWrite) {
    return this.call<void>('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, { fields });
  }

  async transitions(key: string) {
    const res = await this.call<{ transitions: JiraTransition[] }>(
      'GET',
      `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
    );
    return res.transitions;
  }

  transition(key: string, transitionId: string) {
    return this.call<void>('POST', `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
      transition: { id: transitionId },
    });
  }

  findUsers(query: string) {
    return this.call<JiraUser[]>(
      'GET',
      `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=10`,
    );
  }
}

export const jiraConfigured = () =>
  Boolean(config.JIRA_BASE_URL && config.JIRA_EMAIL && config.JIRA_API_TOKEN);

/** The configured JIRA, or null when the sync is off. */
export function jiraFromConfig(): JiraClient | null {
  return jiraConfigured()
    ? new HttpJiraClient(config.JIRA_BASE_URL!, config.JIRA_EMAIL!, config.JIRA_API_TOKEN!)
    : null;
}
