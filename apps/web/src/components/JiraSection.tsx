import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  api,
  canManageStaffing,
  type JiraProjectSync,
  type JiraStatus,
  type Project,
} from '../lib/api';
import { buttonClass, errorMessage, inputClass } from '../lib/forms';

const card = 'rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]';

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const show = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '(empty)'
    : Array.isArray(v)
      ? v.join(', ') || '(none)'
      : typeof v === 'string' && v.startsWith('jira:')
        ? 'someone not in SedHub'
        : String(v);

/**
 * JIRA two-way sync for a project (M3): the JIRA project it syncs with, Sync now, and the last
 * syncs with any conflicts (a field changed on both sides; the latest edit was kept) and warnings.
 */
export function JiraSection({ project, canSync }: { project: Project; canSync: boolean }) {
  const qc = useQueryClient();
  const staffing = canManageStaffing();
  const [key, setKey] = useState(project.jiraKey ?? '');
  const { data: status } = useQuery({
    queryKey: ['jira', 'status'],
    queryFn: () => api<JiraStatus>('/jira/status'),
  });
  const { data: sync } = useQuery({
    queryKey: ['jira', 'project', project.id],
    queryFn: () => api<JiraProjectSync>(`/jira/projects/${project.id}`),
  });
  const refresh = () => {
    for (const queryKey of [['jira'], ['projects'], ['tasks']]) qc.invalidateQueries({ queryKey });
  };

  const saveKey = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ jiraKey: key.trim() || null }),
      }),
    onSuccess: refresh,
  });
  const syncNow = useMutation({
    mutationFn: () => api(`/jira/projects/${project.id}/sync`, { method: 'POST' }),
    onSuccess: refresh,
    onSettled: refresh,
  });

  const last = sync?.runs[0];
  const issueUrl = (k: string) =>
    status?.baseUrl ? `${status.baseUrl.replace(/\/$/, '')}/browse/${k}` : null;
  const th = 'border-b border-line px-3 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-3 py-2 align-top';

  return (
    <section className={`${card} lg:col-span-2`} aria-labelledby="jira-heading">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2.5">
        <h2 id="jira-heading" className="flex-1 font-semibold">
          JIRA sync
        </h2>
        {canSync && (
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={!status?.configured || !project.jiraKey || syncNow.isPending}
            onClick={() => syncNow.mutate()}
          >
            {syncNow.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </header>

      <div className="flex flex-col gap-3 px-3 py-3 text-sm">
        {status && !status.configured && (
          <p className="rounded-md bg-amber-soft px-3 py-2">
            JIRA isn’t connected yet. An administrator sets the JIRA site and an API token on the
            server (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN); until then nothing syncs.
          </p>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveKey.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            JIRA project key
            <input
              className={`${inputClass} w-40 placeholder:normal-case`}
              value={key}
              placeholder="e.g. ATL"
              maxLength={10}
              disabled={!staffing}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
            />
          </label>
          {staffing && (
            <button
              type="submit"
              className={buttonClass()}
              disabled={saveKey.isPending || key.trim().toUpperCase() === (project.jiraKey ?? '')}
            >
              {!key.trim() && project.jiraKey ? 'Unlink' : 'Save'}
            </button>
          )}
          <p className="basis-full text-xs text-muted">
            {project.jiraKey
              ? `Tasks here and issues in ${project.jiraKey} stay in step${status?.intervalMinutes ? `, every ${status.intervalMinutes} minutes` : ''}: summary, description, status, priority, type, assignee, due date, labels and estimate. When the same field changed on both sides, the latest edit wins and is listed below. Deleting doesn’t sync.`
              : 'Not linked. Enter the key of the JIRA project to sync with.'}
          </p>
        </form>

        {(saveKey.error || syncNow.error) && (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">
            {errorMessage(saveKey.error ?? syncNow.error)}
          </p>
        )}

        {last && (last.details.length > 0 || last.error) && (
          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted uppercase">Last sync</h3>
            {last.error && (
              <p role="alert" className="mb-2 rounded-md bg-red-soft px-3 py-2 text-red">
                Failed: {last.error}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {last.details.map((d, i) => (
                <li key={i} className="text-xs">
                  <b className={d.kind === 'conflict' ? 'text-plum' : 'text-amber'}>
                    {d.kind === 'conflict' ? 'Conflict' : 'Warning'}
                  </b>{' '}
                  {[d.task, d.issue].filter(Boolean).join(' / ')}
                  {d.field && ` · ${d.field}`}
                  {d.kind === 'conflict'
                    ? `: changed on both sides; kept ${d.kept === 'jira' ? 'JIRA' : 'SedHub'}’s “${show(d.kept === 'jira' ? d.jira : d.sedhub)}” over “${show(d.kept === 'jira' ? d.sedhub : d.jira)}”.`
                    : `: ${d.message}`}
                  {d.issue && issueUrl(d.issue) && (
                    <>
                      {' '}
                      <a
                        className="text-teal hover:underline"
                        href={issueUrl(d.issue)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in JIRA
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sync && sync.runs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]" aria-label="Recent syncs">
              <thead>
                <tr>
                  {['When', 'Result', 'From JIRA', 'To JIRA', 'Conflicts'].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sync.runs.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} whitespace-nowrap`}>
                      {when.format(new Date(r.startedAt))}
                    </td>
                    <td className={td}>
                      {r.ok ? (
                        'OK'
                      ) : r.finishedAt ? (
                        <span className="text-red">Failed</span>
                      ) : (
                        'Running'
                      )}
                    </td>
                    <td className={td}>{r.pulled}</td>
                    <td className={td}>{r.pushed}</td>
                    <td className={td}>{r.conflicts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sync && !sync.runs.length && project.jiraKey && (
          <p className="text-xs text-muted">No syncs yet.</p>
        )}
      </div>
    </section>
  );
}
