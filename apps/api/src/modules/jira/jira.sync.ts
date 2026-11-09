import type { Prisma, TaskStatus } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { record, trackedSelect } from '../tasks/history.service.js';
import { nextTaskNumber, taskKey } from '../tasks/tasks.service.js';
import { type JiraClient, JiraError, type JiraIssue, type JiraIssueWrite } from './jira.client.js';
import {
  FIELD_LABEL,
  fromIssue,
  fromTask,
  sameValue,
  statusFromJira,
  SYNCED,
  type SyncedFields,
  toIssueFields,
  toTaskData,
} from './jira.mapping.js';

/**
 * Two-way sync of one SedHub project with its JIRA project (M3-02), and what happens when both
 * sides changed (M3-03).
 *
 * Each linked task keeps the values it and its issue last agreed on (JiraSyncState.base). For
 * every synced field: changed only in JIRA → copied to SedHub; changed only in SedHub → copied
 * to JIRA; changed on both sides → the side edited most recently wins, and the run lists the
 * conflict (also in the audit log). New issues become tasks and new tasks become issues;
 * deletions are not synced. Sprints, epics, comments and hours are not synced yet.
 */

/** Overlap between runs, so an edit made while the previous run was going isn't missed. */
const OVERLAP_MS = 2 * 60 * 1000;

export interface SyncDetail {
  kind: 'conflict' | 'warning';
  task?: string;
  issue?: string;
  field?: string;
  /** Conflicts: which side's value was kept. */
  kept?: 'jira' | 'sedhub';
  jira?: unknown;
  sedhub?: unknown;
  message?: string;
}

const running = new Set<string>();

type LocalTask = Prisma.TaskGetPayload<{ include: { jiraSync: true } }>;

/** The same field counts as unchanged when JIRA has a person SedHub can't show (null here). */
function equal(field: keyof SyncedFields, a: unknown, b: unknown) {
  if (field === 'assignee') {
    const unmatched = (v: unknown) => typeof v === 'string' && v.startsWith('jira:');
    if ((a === null && unmatched(b)) || (b === null && unmatched(a))) return true;
  }
  return sameValue(a, b);
}

/** Sync one project now. Throws 409 when JIRA isn't set up for it or a sync is already running. */
export async function syncProject(projectId: string, client: JiraClient, now = new Date()) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, code: true, jiraKey: true, members: { select: { personId: true } } },
  });
  if (!project.jiraKey) throw new HttpError(409, 'Set the JIRA project key in Settings first.');
  if (running.has(projectId))
    throw new HttpError(409, 'A sync of this project is already running.');
  running.add(projectId);

  const run = await prisma.jiraSyncRun.create({ data: { projectId, startedAt: now } });
  const details: SyncDetail[] = [];
  const counts = { pulled: 0, pushed: 0, conflicts: 0 };
  try {
    const last = await prisma.jiraSyncRun.findFirst({
      where: { projectId, ok: true },
      orderBy: { startedAt: 'desc' },
    });
    const since = last ? new Date(last.startedAt.getTime() - OVERLAP_MS) : null;
    const ctx = await context(project, client);

    const issues = await client.searchIssues(project.jiraKey, since);
    const locals = await prisma.task.findMany({
      where: {
        OR: [
          { jiraKey: { in: issues.map((i) => i.key) } },
          {
            projectId,
            OR: [{ jiraKey: null }, ...(since ? [{ updatedAt: { gte: since } }] : [{}])],
          },
        ],
      },
      include: { jiraSync: true },
    });
    const byKey = new Map(locals.filter((t) => t.jiraKey).map((t) => [t.jiraKey!, t]));
    const done = new Set<string>();

    // Issues changed in JIRA (and their tasks, if any).
    for (const issue of issues) {
      const task = byKey.get(issue.key);
      if (task && task.projectId !== projectId) {
        details.push({
          kind: 'warning',
          issue: issue.key,
          message: 'Linked to a task in another project; skipped.',
        });
        continue;
      }
      if (task) {
        done.add(task.id);
        await reconcile(ctx, task, issue, details, counts);
      } else {
        await createTask(ctx, issue);
        counts.pulled++;
      }
    }

    // Tasks changed in SedHub whose issues didn't change, and tasks not yet in JIRA.
    for (const task of locals) {
      if (done.has(task.id) || task.projectId !== projectId) continue;
      if (task.jiraKey) {
        let issue: JiraIssue;
        try {
          issue = await client.getIssue(task.jiraKey);
        } catch (err) {
          if (err instanceof JiraError && err.status === 404) {
            details.push({
              kind: 'warning',
              task: ctx.key(task),
              issue: task.jiraKey,
              message: 'The JIRA issue no longer exists; the task was left as it is.',
            });
            continue;
          }
          throw err;
        }
        await reconcile(ctx, task, issue, details, counts);
      } else {
        await createIssue(ctx, task, details);
        counts.pushed++;
      }
    }

    await prisma.jiraSyncRun.update({
      where: { id: run.id },
      data: {
        ...counts,
        ok: true,
        finishedAt: new Date(),
        details: details as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    await prisma.jiraSyncRun.update({
      where: { id: run.id },
      data: {
        ...counts,
        ok: false,
        finishedAt: new Date(),
        details: details as unknown as Prisma.InputJsonValue,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  } finally {
    running.delete(projectId);
  }
  return prisma.jiraSyncRun.findUniqueOrThrow({ where: { id: run.id } });
}

// ---------- People ----------

/** Who is who on both sides, for one run: JIRA accounts ↔ SedHub people staffed on the project. */
async function context(
  project: { id: string; code: string; jiraKey: string | null; members: { personId: string }[] },
  client: JiraClient,
) {
  const members = new Set(project.members.map((m) => m.personId));
  const people = await prisma.person.findMany({
    where: { active: true },
    select: { id: true, email: true, jiraAccountId: true },
  });
  const byAccount = new Map(
    people.filter((p) => p.jiraAccountId).map((p) => [p.jiraAccountId!, p]),
  );
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  const accountOfPerson = new Map(
    people.filter((p) => p.jiraAccountId).map((p) => [p.id, p.jiraAccountId!]),
  );

  /** Remember a match both ways (and on the person, for next time). */
  const link = async (personId: string, accountId: string) => {
    if (byAccount.has(accountId)) return;
    const person = people.find((p) => p.id === personId)!;
    person.jiraAccountId = accountId;
    byAccount.set(accountId, person);
    accountOfPerson.set(personId, accountId);
    await prisma.person.update({ where: { id: personId }, data: { jiraAccountId: accountId } });
  };

  return {
    project,
    client,
    key: (t: { number: number }) => taskKey(project.code, t.number),
    /** A JIRA account as a SedHub person on this project, matched by email the first time. */
    async learn(issue: JiraIssue) {
      const a = issue.fields.assignee;
      if (!a || byAccount.has(a.accountId) || !a.emailAddress) return;
      const person = byEmail.get(a.emailAddress.toLowerCase());
      if (person && !person.jiraAccountId) await link(person.id, a.accountId);
    },
    personOf: (accountId: string) => {
      const p = byAccount.get(accountId);
      return p && members.has(p.id) ? p.id : null;
    },
    /** A SedHub person's JIRA account, looked up by email the first time. */
    async account(personId: string | null | undefined) {
      if (!personId || personId.startsWith('jira:') || accountOfPerson.has(personId)) return;
      const person = people.find((p) => p.id === personId);
      if (!person) return;
      const found = await client.findUsers(person.email);
      const match =
        found.find((u) => u.emailAddress?.toLowerCase() === person.email.toLowerCase()) ??
        (found.length === 1 ? found[0] : undefined);
      if (match) await link(person.id, match.accountId);
    },
    accountOf: (personId: string) => accountOfPerson.get(personId),
  };
}
type Ctx = Awaited<ReturnType<typeof context>>;

// ---------- Writes on each side ----------

const completion = (from: TaskStatus | null, to: TaskStatus) =>
  to === 'DONE' && from !== 'DONE'
    ? { completedAt: new Date() }
    : to !== 'DONE' && from === 'DONE'
      ? { completedAt: null }
      : {};

async function saveBase(taskId: string, base: SyncedFields) {
  const value = base as unknown as Prisma.InputJsonValue;
  await prisma.jiraSyncState.upsert({
    where: { taskId },
    create: { taskId, base: value },
    update: { base: value },
  });
}

/** A new issue in JIRA becomes a task here. */
async function createTask(ctx: Ctx, issue: JiraIssue) {
  await ctx.learn(issue);
  const v = fromIssue(issue, ctx.personOf);
  const last = await prisma.task.aggregate({ where: { status: v.status }, _max: { order: true } });
  const task = await prisma.task.create({
    data: {
      ...(toTaskData(v) as Prisma.TaskUncheckedCreateInput),
      title: v.title || issue.key,
      status: v.status,
      ...completion(null, v.status),
      projectId: ctx.project.id,
      number: await nextTaskNumber(ctx.project.id),
      order: (last._max.order ?? 0) + 1000,
      jiraKey: issue.key,
    },
  });
  await record(
    null,
    task.id,
    'task.create',
    null,
    { title: task.title, status: task.status },
    'jira',
  );
  await saveBase(task.id, v);
}

/** JIRA write that drops the fields JIRA refuses (e.g. no time tracking) and says so. */
async function writeIssue(
  write: (fields: JiraIssueWrite) => Promise<unknown>,
  fields: JiraIssueWrite,
  where: { task: string; issue?: string },
  details: SyncDetail[],
) {
  try {
    return await write(fields);
  } catch (err) {
    const refused =
      err instanceof JiraError && err.status === 400 ? Object.keys(err.fieldErrors) : [];
    if (!refused.length) throw err;
    const rest = Object.fromEntries(
      Object.entries(fields).filter(([k]) => !refused.includes(k)),
    ) as JiraIssueWrite;
    details.push({
      kind: 'warning',
      ...where,
      message: `JIRA refused ${refused.join(', ')}: ${refused.map((k) => (err as JiraError).fieldErrors[k]).join('; ')}`,
    });
    return write(rest);
  }
}

/** Move an issue to the JIRA status that matches a SedHub column, if its workflow allows. */
async function moveIssue(
  ctx: Ctx,
  issueKey: string,
  to: TaskStatus,
  task: string,
  details: SyncDetail[],
) {
  const options = await ctx.client.transitions(issueKey);
  const pick = options.find((t) => statusFromJira(t.to) === to);
  if (!pick) {
    details.push({
      kind: 'warning',
      task,
      issue: issueKey,
      field: FIELD_LABEL.status,
      message: `No JIRA transition from the issue's status leads to a status matching ${to}.`,
    });
    return;
  }
  await ctx.client.transition(issueKey, pick.id);
}

/** A task not yet in JIRA becomes an issue there. */
async function createIssue(ctx: Ctx, task: LocalTask, details: SyncDetail[]) {
  const v = fromTask(task);
  await ctx.account(v.assignee);
  const where = { task: ctx.key(task) };
  const { key } = (await writeIssue(
    (fields) => ctx.client.createIssue(ctx.project.jiraKey!, fields),
    toIssueFields(v, ctx.accountOf),
    where,
    details,
  )) as { key: string };
  const created = await ctx.client.getIssue(key);
  if (statusFromJira(created.fields.status) !== v.status)
    await moveIssue(ctx, key, v.status, where.task, details);
  await prisma.task.update({ where: { id: task.id }, data: { jiraKey: key } });
  // What JIRA ended up with is the agreed value; anything it didn't take is retried next time.
  await saveBase(task.id, fromIssue(await ctx.client.getIssue(key), ctx.personOf));
}

/** A task and its issue: copy each field the way it changed, and settle conflicts. */
async function reconcile(
  ctx: Ctx,
  task: LocalTask,
  issue: JiraIssue,
  details: SyncDetail[],
  counts: { pulled: number; pushed: number; conflicts: number },
) {
  await ctx.learn(issue);
  const local = fromTask(task);
  const remote = fromIssue(issue, ctx.personOf);
  const base = task.jiraSync?.base as SyncedFields | undefined;
  const jiraNewer = new Date(issue.fields.updated).getTime() >= task.updatedAt.getTime();

  const toLocal: Partial<SyncedFields> = {};
  const toRemote: Partial<SyncedFields> = {};
  for (const f of SYNCED) {
    const l = local[f];
    const r = remote[f];
    if (equal(f, l, r)) continue;
    if (base && equal(f, l, base[f])) Object.assign(toLocal, { [f]: r });
    else if (base && equal(f, r, base[f])) Object.assign(toRemote, { [f]: l });
    else {
      // Changed on both sides (or never synced): the most recent edit wins.
      const kept = jiraNewer ? 'jira' : 'sedhub';
      Object.assign(kept === 'jira' ? toLocal : toRemote, { [f]: kept === 'jira' ? r : l });
      if (base) {
        details.push({
          kind: 'conflict',
          task: ctx.key(task),
          issue: issue.key,
          field: FIELD_LABEL[f],
          kept,
          jira: r,
          sedhub: l,
        });
        counts.conflicts++;
        await prisma.auditLog.create({
          data: {
            action: 'jira.conflict',
            via: 'jira',
            entityType: 'Task',
            entityId: task.id,
            after: {
              field: FIELD_LABEL[f],
              kept,
              jira: r,
              sedhub: l,
              issue: issue.key,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  if (Object.keys(toLocal).length) {
    const before = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: trackedSelect,
    });
    const status = toLocal.status;
    const after = await prisma.task.update({
      where: { id: task.id },
      data: {
        ...toTaskData(toLocal),
        ...(status ? { status, ...completion(task.status, status) } : {}),
      },
      select: trackedSelect,
    });
    await record(null, task.id, 'task.update', before, after, 'jira');
    counts.pulled++;
  }

  let finalIssue = issue;
  if (Object.keys(toRemote).length) {
    const where = { task: ctx.key(task), issue: issue.key };
    const { status, ...rest } = toRemote;
    await ctx.account(rest.assignee);
    const fields = toIssueFields(rest, ctx.accountOf);
    if (Object.keys(fields).length)
      await writeIssue((f) => ctx.client.updateIssue(issue.key, f), fields, where, details);
    if (status) await moveIssue(ctx, issue.key, status, where.task, details);
    finalIssue = await ctx.client.getIssue(issue.key);
    counts.pushed++;
  }
  await saveBase(task.id, fromIssue(finalIssue, ctx.personOf));
}

/** Every project with a JIRA key, one after another (the scheduled sync). */
export async function syncAll(client: JiraClient) {
  const projects = await prisma.project.findMany({
    where: { jiraKey: { not: null }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    select: { id: true },
  });
  for (const p of projects) {
    try {
      await syncProject(p.id, client);
    } catch (err) {
      // Already running, or set up wrongly: the next run tries again.
      if (!(err instanceof HttpError)) throw err;
    }
  }
}
