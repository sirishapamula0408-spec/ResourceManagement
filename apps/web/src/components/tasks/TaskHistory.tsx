import { useQuery } from '@tanstack/react-query';
import { api, type TaskHistoryEntry, type TaskPriority, type TaskStatus } from '../../lib/api';
import { fmt } from '../../lib/theme';
import { dueLabel, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from './taskHelpers';
import { Avatar } from './taskUi';

const FIELD_LABEL: Record<string, string> = {
  title: 'Summary',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  type: 'Type',
  assignee: 'Assignee',
  estimateHours: 'Estimate',
  startDate: 'Start',
  dueDate: 'Due',
  sprint: 'Sprint',
  epic: 'Epic',
  parent: 'Parent',
  project: 'Project',
  labels: 'Labels',
};

/** A recorded value as people read it: labels, dates, hours, "None". */
function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return 'None';
  if (Array.isArray(v)) return v.join(', ');
  if (field === 'status') return STATUS_LABEL[v as TaskStatus] ?? String(v);
  if (field === 'priority') return PRIORITY_LABEL[v as TaskPriority] ?? String(v);
  if (field === 'type') return TYPE_LABEL[v as keyof typeof TYPE_LABEL] ?? String(v);
  if (field === 'startDate' || field === 'dueDate') return dueLabel(String(v));
  if (field === 'estimateHours') return `${fmt(Number(v))}h`;
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Who changed what on a task and when, newest first (M4 JIRA-lite). */
export function TaskHistory({ taskId, personNames }: { taskId: string; personNames: string[] }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['history', taskId],
    queryFn: () => api<TaskHistoryEntry[]>(`/tasks/${taskId}/history`),
  });
  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;
  if (!entries.length) return <p className="text-sm text-muted">No changes recorded yet.</p>;
  return (
    <ol className="flex flex-col gap-3" aria-label="History">
      {entries.map((e) => {
        const who = e.actor?.name ?? 'Someone';
        return (
          <li key={e.id} className="flex gap-2.5">
            <Avatar name={e.actor?.name ?? null} allNames={personNames} size={26} />
            <div className="min-w-0 flex-1 text-sm">
              <p>
                <b className="font-semibold">{who}</b>{' '}
                {e.action === 'create'
                  ? 'created the task'
                  : e.action === 'worklog'
                    ? `logged ${fmt(e.hours ?? 0, 1)}h`
                    : e.action === 'delete'
                      ? 'deleted the task'
                      : `changed ${e.changes.map((c) => FIELD_LABEL[c.field] ?? c.field).join(', ')}`}
                <span className="ml-2 text-xs text-muted">{when(e.at)}</span>
              </p>
              {e.changes.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                  {e.changes.map((c) => (
                    <li key={c.field} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-20 shrink-0 text-muted">
                        {FIELD_LABEL[c.field] ?? c.field}
                      </span>
                      <span className="text-muted line-through">{show(c.field, c.from)}</span>
                      <span aria-hidden>→</span>
                      <span className="sr-only">to</span>
                      <span className="font-medium">{show(c.field, c.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
