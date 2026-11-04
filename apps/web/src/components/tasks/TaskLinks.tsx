import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type LinkKind, type Task, type TaskLink } from '../../lib/api';
import { buttonClass, errorMessage, inputClass } from '../../lib/forms';
import { StatusPill } from './taskUi';

const KIND_LABEL: Record<LinkKind, string> = {
  BLOCKS: 'blocks',
  BLOCKED_BY: 'is blocked by',
  RELATES: 'relates to',
};
const KINDS: LinkKind[] = ['BLOCKED_BY', 'BLOCKS', 'RELATES'];

/**
 * Issue links on one task (M4 JIRA-lite): "blocks", "is blocked by" and "relates to", possibly
 * to tasks on other projects. Admins, PMs on the project and the assignee add and remove links.
 */
export function TaskLinks({
  task,
  canEdit,
  onOpen,
}: {
  task: Task;
  canEdit: boolean;
  /** Open a linked task in the dialog (when it is in the loaded task list). */
  onOpen?: (t: Task) => void;
}) {
  const qc = useQueryClient();
  const queryKey = ['links', task.id];
  const { data: links = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api<TaskLink[]>(`/tasks/${task.id}/links`),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });
  const [kind, setKind] = useState<LinkKind>('BLOCKED_BY');
  const [target, setTarget] = useState('');

  const changed = () => {
    qc.invalidateQueries({ queryKey: ['links'] }); // both ends of a link
    qc.invalidateQueries({ queryKey: ['tasks'] }); // blocked badges
  };
  const add = useMutation({
    mutationFn: () =>
      api(`/tasks/${task.id}/links`, {
        method: 'POST',
        // Suggestions read "ATLAS-12 · Title"; the API wants the key.
        body: JSON.stringify({ kind, targetKey: target.split(' ')[0] }),
      }),
    onSuccess: () => {
      setTarget('');
      changed();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/tasks/${task.id}/links/${id}`, { method: 'DELETE' }),
    onSuccess: changed,
  });

  const grouped = KINDS.map((k) => ({ kind: k, rows: links.filter((l) => l.kind === k) })).filter(
    (g) => g.rows.length,
  );
  const linked = new Set(links.map((l) => l.task.id));
  const suggestions = tasks.filter((t) => t.id !== task.id && !linked.has(t.id));
  const error = add.error ?? remove.error;

  if (!canEdit && !links.length && !isLoading) return null;
  return (
    <section className="flex flex-col gap-2 sm:col-span-2" aria-label="Links">
      <h4 className="text-xs font-medium text-muted">
        Links{links.length ? ` · ${links.length}` : ''}
      </h4>
      {grouped.map((g) => (
        <div key={g.kind}>
          <p className="mb-1 text-xs text-muted">{KIND_LABEL[g.kind]}</p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {g.rows.map((l) => {
              const loaded = tasks.find((t) => t.id === l.task.id);
              return (
                <li key={l.id} className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm">
                  <span className="text-xs font-semibold text-muted">{l.task.key}</span>
                  {loaded && onOpen ? (
                    <button
                      type="button"
                      className="flex-1 truncate text-left hover:text-teal hover:underline"
                      onClick={() => onOpen(loaded)}
                    >
                      {l.task.title}
                    </button>
                  ) : (
                    <span className="flex-1 truncate">{l.task.title}</span>
                  )}
                  <StatusPill status={l.task.status} />
                  {canEdit && (
                    <button
                      type="button"
                      className="text-muted hover:text-red"
                      aria-label={`Remove link to ${l.task.key}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(l.id)}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <select
            className={inputClass}
            aria-label="Link type"
            value={kind}
            onChange={(e) => setKind(e.target.value as LinkKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input
            className={`${inputClass} min-w-[12rem] flex-1`}
            list={`link-targets-${task.id}`}
            placeholder="Task key, e.g. ATLAS-12"
            aria-label="Task to link"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && target.trim()) {
                e.preventDefault();
                add.mutate();
              }
            }}
          />
          <datalist id={`link-targets-${task.id}`}>
            {suggestions.map((t) => (
              <option key={t.id} value={`${t.key} · ${t.title}`} />
            ))}
          </datalist>
          <button
            type="button"
            className={buttonClass()}
            disabled={add.isPending || !target.trim()}
            onClick={() => add.mutate()}
          >
            {add.isPending ? 'Linking…' : 'Link'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red">
          {errorMessage(error)}
        </p>
      )}
    </section>
  );
}
