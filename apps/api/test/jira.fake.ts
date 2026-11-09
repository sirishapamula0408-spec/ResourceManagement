import {
  type JiraClient,
  JiraError,
  type JiraIssue,
  type JiraIssueWrite,
  type JiraTransition,
  type JiraUser,
} from '../src/modules/jira/jira.client.js';

/**
 * An in-memory JIRA for the sync tests: one project, a simple workflow where any status can move
 * to any other, users found by email, and switches for the awkward cases (no time tracking, a
 * status with no way in).
 */

const STATUSES: Record<string, string> = {
  Backlog: 'new',
  'To Do': 'new',
  'In Progress': 'indeterminate',
  'In Review': 'indeterminate',
  Done: 'done',
};

export class FakeJira implements JiraClient {
  issues = new Map<string, JiraIssue>();
  users: JiraUser[] = [];
  /** Statuses no transition leads to (to test a workflow that can't follow SedHub). */
  unreachable = new Set<string>();
  /** When false, setting an estimate fails as on a project without time tracking. */
  timeTracking = true;
  private next = 1;

  constructor(public readonly projectKey: string) {}

  private touch(issue: JiraIssue) {
    issue.fields.updated = new Date().toISOString();
  }

  /** Make an issue as someone working in JIRA would. */
  add(fields: Partial<JiraIssue['fields']> & { summary: string }) {
    const key = `${this.projectKey}-${this.next++}`;
    const issue: JiraIssue = {
      key,
      fields: {
        description: null,
        status: { name: 'To Do', statusCategory: { key: 'new' } },
        priority: { name: 'Medium' },
        issuetype: { name: 'Task' },
        assignee: null,
        duedate: null,
        labels: [],
        timetracking: {},
        updated: new Date().toISOString(),
        ...fields,
      },
    };
    this.issues.set(key, issue);
    return issue;
  }

  /** Edit an issue as someone in JIRA would. */
  edit(key: string, fields: Partial<JiraIssue['fields']>) {
    const issue = this.issues.get(key)!;
    Object.assign(issue.fields, fields);
    this.touch(issue);
  }

  setStatus(key: string, name: string) {
    this.edit(key, { status: { name, statusCategory: { key: STATUSES[name] } } });
  }

  async searchIssues(projectKey: string, since: Date | null) {
    return [...this.issues.values()]
      .filter((i) => i.key.startsWith(`${projectKey}-`))
      .filter((i) => !since || new Date(i.fields.updated) >= since)
      .map((i) => structuredClone(i));
  }

  async getIssue(key: string) {
    const issue = this.issues.get(key);
    if (!issue) throw new JiraError(404, 'Issue does not exist');
    return structuredClone(issue);
  }

  private apply(issue: JiraIssue, fields: JiraIssueWrite) {
    if ('timetracking' in fields && !this.timeTracking) {
      throw new JiraError(400, 'Field cannot be set', {
        timetracking: 'Field timetracking cannot be set. It is not on the appropriate screen.',
      });
    }
    const f = issue.fields;
    if (fields.summary !== undefined) f.summary = fields.summary;
    if (fields.description !== undefined) f.description = fields.description;
    if (fields.priority) f.priority = fields.priority;
    if (fields.issuetype) f.issuetype = fields.issuetype;
    if (fields.assignee !== undefined)
      f.assignee = fields.assignee
        ? (this.users.find((u) => u.accountId === fields.assignee!.accountId) ?? null)
        : null;
    if (fields.duedate !== undefined) f.duedate = fields.duedate;
    if (fields.labels) f.labels = fields.labels;
    if (fields.timetracking) {
      const est = (fields.timetracking as { originalEstimate?: string }).originalEstimate;
      f.timetracking = est ? { originalEstimateSeconds: parseInt(est, 10) * 60 } : {};
    }
    this.touch(issue);
  }

  async createIssue(_projectKey: string, fields: JiraIssueWrite) {
    const issue = this.add({ summary: fields.summary ?? '' });
    this.apply(issue, fields);
    return { key: issue.key };
  }

  async updateIssue(key: string, fields: JiraIssueWrite) {
    this.apply(this.issues.get(key)!, fields);
  }

  async transitions(key: string): Promise<JiraTransition[]> {
    const current = this.issues.get(key)!.fields.status.name;
    return Object.entries(STATUSES)
      .filter(([name]) => name !== current && !this.unreachable.has(name))
      .map(([name, category], i) => ({
        id: String(i + 1),
        name: `Move to ${name}`,
        to: { name, statusCategory: { key: category } },
      }));
  }

  async transition(key: string, transitionId: string) {
    const t = (await this.transitions(key)).find((x) => x.id === transitionId);
    if (!t) throw new JiraError(400, 'Transition not allowed');
    this.setStatus(key, t.to.name);
  }

  async findUsers(query: string) {
    return this.users.filter((u) => u.emailAddress?.toLowerCase() === query.toLowerCase());
  }
}
