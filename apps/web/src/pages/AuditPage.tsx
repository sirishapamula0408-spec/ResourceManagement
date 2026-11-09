import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { useTaskLookups } from '../components/tasks/taskHelpers';
import { api, auth } from '../lib/api';
import { buttonClass, inputClass } from '../lib/forms';

interface AuditEntry {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entity: string | null;
  actor: { id: string; name: string } | null;
  ip: string | null;
  before: unknown;
  after: unknown;
}

const AREAS = [
  ['', 'Everything'],
  ['auth', 'Sign-ins'],
  ['task', 'Tasks'],
  ['project', 'Projects'],
  ['person', 'People'],
  ['team', 'Teams'],
  ['leave', 'Leave'],
  ['settings', 'Settings'],
  ['jira', 'JIRA sync'],
] as const;

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.locked': 'Account locked',
  'auth.mfa_failed': 'Wrong authenticator code',
  'auth.mfa_enabled': 'Turned on two-step verification',
  'auth.mfa_disabled': 'Turned off two-step verification',
  'person.mfa_reset': 'Reset two-step verification',
  'task.create': 'Created task',
  'task.update': 'Changed task',
  'task.delete': 'Deleted task',
  'task.worklog': 'Logged hours',
  'task.attach': 'Attached a file',
  'task.detach': 'Removed a file',
  'person.create': 'Added person',
  'person.update': 'Edited person',
  'person.remove': 'Removed person',
  'person.projects': 'Changed person’s projects',
  'project.create': 'Created project',
  'project.update': 'Edited project',
  'project.delete': 'Deleted project',
  'project.members': 'Changed project team',
  'team.create': 'Created team',
  'team.update': 'Edited team',
  'team.delete': 'Deleted team',
  'leave.create': 'Recorded leave',
  'leave.update': 'Changed leave',
  'leave.delete': 'Deleted leave',
  'settings.thresholds': 'Changed utilization limits',
  'jira.conflict': 'JIRA conflict (latest edit kept)',
};

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "field: value" pairs of a change, short enough for a table cell. */
function summary(value: unknown): string {
  if (value == null || typeof value !== 'object') return value == null ? '' : String(value);
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => {
      const text = Array.isArray(v)
        ? `${v.length} item${v.length === 1 ? '' : 's'}`
        : v && typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
      return `${k}: ${text.length > 60 ? `${text.slice(0, 57)}…` : text}`;
    })
    .join(' · ');
}

/** Admins only: who changed what, and every sign-in, newest first. */
export function AuditPage() {
  const isAdmin = auth.getUser()?.role === 'ADMIN';
  const { people } = useTaskLookups();
  const [filter, setFilter] = useState({ area: '', actorId: '', from: '', to: '' });
  const set = (patch: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...patch }));

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useInfiniteQuery({
      queryKey: ['audit', filter],
      enabled: isAdmin,
      initialPageParam: '',
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '50' });
        for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v);
        if (pageParam) params.set('cursor', pageParam);
        return api<{ entries: AuditEntry[]; nextCursor: string | null }>(`/audit?${params}`);
      },
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
  const entries = data?.pages.flatMap((p) => p.entries) ?? [];

  if (!isAdmin) return <p className="text-muted">Only admins can see the audit log.</p>;

  const th =
    'border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-top';

  return (
    <>
      <PageHeader title="Audit log" subtitle="Sign-ins and changes, newest first">
        <select
          className={inputClass}
          aria-label="Area"
          value={filter.area}
          onChange={(e) => set({ area: e.target.value })}
        >
          {AREAS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          aria-label="Who"
          value={filter.actorId}
          onChange={(e) => set({ actorId: e.target.value })}
        >
          <option value="">Anyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={inputClass}
          aria-label="From"
          value={filter.from}
          onChange={(e) => set({ from: e.target.value })}
        />
        <input
          type="date"
          className={inputClass}
          aria-label="To"
          value={filter.to}
          min={filter.from || undefined}
          onChange={(e) => set({ to: e.target.value })}
        />
      </PageHeader>

      <section className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {['When', 'Who', 'What', 'Subject', 'Details', 'IP address'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const details = [
                  e.before != null ? `was ${summary(e.before)}` : '',
                  summary(e.after),
                ]
                  .filter(Boolean)
                  .join(' → ');
                return (
                  <tr key={e.id}>
                    <td className={`${td} whitespace-nowrap`}>{when.format(new Date(e.at))}</td>
                    <td className={td}>{e.actor?.name ?? <span className="text-muted">—</span>}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {ACTION_LABEL[e.action] ?? e.action}
                    </td>
                    <td className={td}>
                      {e.entity ?? (
                        <span className="text-muted">
                          {e.entityId ? `${e.entityType} (removed)` : e.entityType}
                        </span>
                      )}
                    </td>
                    <td className={`${td} max-w-[420px] text-xs break-words text-muted`}>
                      {details}
                    </td>
                    <td className={`${td} text-xs text-muted`}>{e.ip}</td>
                  </tr>
                );
              })}
              {!isLoading && !entries.length && (
                <tr>
                  <td colSpan={6} className="p-2.5 text-center text-xs text-muted">
                    {error ? `Couldn’t load the audit log: ${error.message}` : 'Nothing recorded.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasNextPage && (
          <div className="flex justify-center p-3">
            <button
              className={buttonClass()}
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
