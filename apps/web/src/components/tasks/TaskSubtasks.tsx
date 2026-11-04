import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Task } from '../../lib/api';
import { buttonClass, errorMessage, inputClass } from '../../lib/forms';
import { StatusPill } from './taskUi';

/**
 * Sub-tasks of a task (M4 JIRA-lite): the list with each one's status, how many are done, and
 * a quick add for those who manage the project. Sub-tasks go one level deep, so a sub-task
 * shows its parent instead (see the dialog).
 */
export function TaskSubtasks({
  task,
  canAdd,
  onOpen,
}: {
  task: Task;
  canAdd: boolean;
  /** Open a sub-task in the dialog. */
  onOpen?: (subtask: Task) => void;
}) {
  const qc = useQueryClient();
  // The board and list already load every task; reuse that list.
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });
  const subtasks = tasks.filter((t) => t.parent?.id === task.id);
  const done = subtasks.filter((t) => t.status === 'DONE').length;
  const [title, setTitle] = useState('');

  const add = useMutation({
    mutationFn: (summary: string) =>
      api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId: task.project.id,
          parentId: task.id,
          title: summary,
          sprintId: task.sprint?.id ?? null,
          epicId: task.epic?.id ?? null,
        }),
      }),
    onSuccess: (_r, summary) => {
      setTitle((t) => (t === summary ? '' : t));
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const submit = () => title.trim() && add.mutate(title.trim());

  if (!subtasks.length && !canAdd) return null;
  return (
    <section className="flex flex-col gap-2 sm:col-span-2" aria-label="Sub-tasks">
      <h4 className="flex items-center gap-2 text-xs font-medium text-muted">
        Sub-tasks
        {subtasks.length > 0 && (
          <>
            <span className="tabular-nums">
              · {done} of {subtasks.length} done
            </span>
            <span className="h-1.5 w-16 overflow-hidden rounded-sm bg-line">
              <i
                className="block h-full bg-teal"
                style={{ width: `${(100 * done) / subtasks.length}%` }}
              />
            </span>
          </>
        )}
      </h4>
      {subtasks.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">{s.key}</span>
              {onOpen ? (
                <button
                  type="button"
                  className="flex-1 truncate text-left hover:text-teal hover:underline"
                  onClick={() => onOpen(s)}
                >
                  {s.title}
                </button>
              ) : (
                <span className="flex-1 truncate">{s.title}</span>
              )}
              <span className="text-xs text-muted">{s.assignee?.name ?? 'Unassigned'}</span>
              <StatusPill status={s.status} />
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <div className="flex gap-2">
          <input
            className={`${inputClass} flex-1`}
            placeholder="Add a sub-task"
            aria-label="Add a sub-task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            className={buttonClass()}
            disabled={add.isPending || !title.trim()}
            onClick={submit}
          >
            {add.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
      {add.error && (
        <p role="alert" className="text-xs text-red">
          {errorMessage(add.error)}
        </p>
      )}
    </section>
  );
}

/** "Sub-task of ATLAS-3 · Title" at the top of a sub-task's dialog; opens the parent. */
export function ParentLink({ task, onOpen }: { task: Task; onOpen?: (parent: Task) => void }) {
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });
  if (!task.parent) return null;
  const parent = tasks.find((t) => t.id === task.parent!.id);
  const label = `${task.parent.key} · ${task.parent.title}`;
  return (
    <p className="text-xs text-muted sm:col-span-2">
      Sub-task of{' '}
      {parent && onOpen ? (
        <button
          type="button"
          className="font-medium text-ink hover:text-teal hover:underline"
          onClick={() => onOpen(parent)}
        >
          {label}
        </button>
      ) : (
        <b className="font-medium text-ink">{label}</b>
      )}
    </p>
  );
}
