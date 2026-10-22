import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  api,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '../../lib/api';
import { errorMessage, inputClass } from '../../lib/forms';
import { fmt } from '../../lib/theme';
import { Dialog, Field } from '../Dialog';
import {
  currentTaskFilter,
  hours,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  useTaskLookups,
  useTaskPermissions,
} from './taskHelpers';

const PRIORITIES: TaskPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const TYPES: TaskType[] = ['STORY', 'TASK', 'BUG', 'SUPPORT'];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (days: number) => isoDay(new Date(Date.now() + days * 86_400_000));

/**
 * Create or edit a task (scope plan: summary, project, assignee, status, priority, type,
 * estimate, start, due, hours logged, description; due cannot be before start).
 */
export function TaskDialog({
  task,
  onClose,
  onSaved,
}: {
  task: Task | null;
  onClose: () => void;
  /** Called with a short confirmation, e.g. for a toast. */
  onSaved?: (message: string) => void;
}) {
  const qc = useQueryClient();
  const { people, projects } = useTaskLookups();
  const { canManageProject, canWork, manageableProjects } = useTaskPermissions();

  const filter = currentTaskFilter();
  const defaultProject =
    (filter.projectId && canManageProject(filter.projectId) && filter.projectId) ||
    manageableProjects[0]?.id ||
    '';
  const [form, setForm] = useState({
    title: task?.title ?? '',
    projectId: task?.project.id ?? defaultProject,
    assigneeId: task ? (task.assignee?.id ?? '') : filter.assigneeId,
    status: task?.status ?? ('TODO' as TaskStatus),
    priority: task?.priority ?? ('MEDIUM' as TaskPriority),
    type: task?.type ?? ('TASK' as TaskType),
    estimateHours: task ? (task.estimateHours ?? '') : '8',
    startDate: task ? (task.startDate?.slice(0, 10) ?? '') : addDays(0),
    dueDate: task ? (task.dueDate?.slice(0, 10) ?? '') : addDays(4),
    description: task?.description ?? '',
  });
  const [logHours, setLogHours] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  // What this user may do here.
  const manages = canManageProject(task?.project.id ?? form.projectId);
  const works = task ? canWork(task) : manages;
  const readOnly = !manages && !works;

  // Assignee choices: the selected project's team (plus the current assignee, if they left it).
  const project = projects.find((p) => p.id === form.projectId);
  const members = project?.members ?? [];
  const assigneeChoices =
    task?.assignee && !members.some((m) => m.id === task.assignee!.id)
      ? [...members, task.assignee]
      : members;
  const assigneeName = (id: string) => people.find((p) => p.id === id)?.name;

  const refresh = () => {
    for (const queryKey of [['tasks'], ['dashboard'], ['projects']]) {
      qc.invalidateQueries({ queryKey });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        title: form.title,
        projectId: form.projectId,
        assigneeId: form.assigneeId || null,
        status: form.status,
        priority: form.priority,
        type: form.type,
        estimateHours: form.estimateHours === '' ? null : Number(form.estimateHours),
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        description: form.description || null,
      };
      let id = task?.id;
      if (!task) {
        id = (await api<{ id: string }>('/tasks', { method: 'POST', body: JSON.stringify(fields) }))
          .id;
      } else if (manages) {
        await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(fields) });
      } else if (form.status !== task.status) {
        // Assignees may only change the status.
        await api(`/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: form.status }),
        });
      }
      const logged = Number(logHours);
      if (logged > 0) {
        await api(`/tasks/${id}/worklogs`, {
          method: 'POST',
          body: JSON.stringify({ hours: logged }),
        });
      }
    },
    onSuccess: () => {
      refresh();
      onSaved?.(task ? `${task.key} saved` : 'Task created');
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/tasks/${task!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      onSaved?.(`${task!.key} deleted`);
      onClose();
    },
  });

  function submit() {
    setLocalError(null);
    if (!form.title.trim()) return setLocalError('Add a summary to save the task.');
    if (!form.projectId) return setLocalError('Choose a project.');
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) {
      return setLocalError('Due date must be on or after the start date.');
    }
    save.mutate();
  }

  const apiError = save.error ?? remove.error;
  const lock = !manages; // fields only a project manager may change

  if (!task && manageableProjects.length === 0) {
    return (
      <Dialog title="Create task" onClose={onClose} onSave={onClose} readOnly>
        <p className="text-muted sm:col-span-2">
          You can create tasks on projects you manage. Sign in as an admin, or ask to be added to a
          project as a PM.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={task ? `${task.key} · ${readOnly ? 'Task' : 'Edit task'}` : 'Create task'}
      onClose={onClose}
      onSave={submit}
      onDelete={task && manages ? () => remove.mutate() : undefined}
      deleteConfirm={`Delete ${task?.key}? This can’t be undone.`}
      saving={save.isPending || remove.isPending}
      error={localError ?? (apiError ? errorMessage(apiError) : null)}
      readOnly={readOnly}
      notice={
        readOnly
          ? 'Sign in as an admin or a PM on this project to edit this task.'
          : !manages
            ? 'You can change the status of, and log hours on, tasks assigned to you.'
            : undefined
      }
    >
      <Field label="Summary" full>
        <input
          className={inputClass}
          value={form.title}
          disabled={lock}
          autoFocus={!task}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label="Project">
        <select
          className={inputClass}
          value={form.projectId}
          disabled={lock}
          onChange={(e) => {
            const next = projects.find((p) => p.id === e.target.value);
            // Keep the assignee only if they are on the new project's team.
            const keep = next?.members.some((m) => m.id === form.assigneeId);
            set({ projectId: e.target.value, assigneeId: keep ? form.assigneeId : '' });
          }}
        >
          {(task && lock ? projects : manageableProjects).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Assignee">
        <select
          className={inputClass}
          value={form.assigneeId}
          disabled={lock}
          onChange={(e) => set({ assigneeId: e.target.value })}
        >
          <option value="">Unassigned</option>
          {assigneeChoices.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          {form.assigneeId && !assigneeChoices.some((m) => m.id === form.assigneeId) && (
            <option value={form.assigneeId}>
              {assigneeName(form.assigneeId)} (not on project)
            </option>
          )}
        </select>
      </Field>
      <Field label="Status">
        <select
          className={inputClass}
          value={form.status}
          disabled={readOnly}
          onChange={(e) => set({ status: e.target.value as TaskStatus })}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Priority">
        <select
          className={inputClass}
          value={form.priority}
          disabled={lock}
          onChange={(e) => set({ priority: e.target.value as TaskPriority })}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select
          className={inputClass}
          value={form.type}
          disabled={lock}
          onChange={(e) => set({ type: e.target.value as TaskType })}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Estimate (hours)">
        <input
          type="number"
          min={0}
          step={1}
          className={inputClass}
          value={form.estimateHours}
          disabled={lock}
          onChange={(e) => set({ estimateHours: e.target.value })}
        />
      </Field>
      <Field label="Start">
        <input
          type="date"
          className={inputClass}
          value={form.startDate}
          disabled={lock}
          onChange={(e) => set({ startDate: e.target.value })}
        />
      </Field>
      <Field label="Due">
        <input
          type="date"
          className={inputClass}
          value={form.dueDate}
          min={form.startDate || undefined}
          disabled={lock}
          onChange={(e) => set({ dueDate: e.target.value })}
        />
      </Field>
      <Field label={task ? `Hours logged · ${fmt(task.loggedHours, 1)}h so far` : 'Hours logged'}>
        <input
          type="number"
          min={0}
          max={24}
          step={0.5}
          className={inputClass}
          placeholder="Add hours worked today"
          value={logHours}
          disabled={readOnly}
          onChange={(e) => setLogHours(e.target.value)}
        />
      </Field>
      {task && (
        <p className="self-end pb-2 text-xs text-muted">
          Estimate {fmt(hours(task.estimateHours))}h · logged hours are saved to your worklog.
        </p>
      )}
      <Field label="Description" full>
        <textarea
          className={inputClass}
          rows={3}
          value={form.description}
          disabled={lock}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
    </Dialog>
  );
}
