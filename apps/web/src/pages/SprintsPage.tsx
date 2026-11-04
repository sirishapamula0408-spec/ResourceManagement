import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BurndownChart } from '../components/BurndownChart';
import { Dialog, Field } from '../components/Dialog';
import { PageHeader } from '../components/PageHeader';
import { RowActions } from '../components/RowActions';
import { Toast } from '../components/tasks/taskUi';
import {
  dueLabel,
  SPRINT_STATUS_LABEL,
  usePlanningLookups,
  useTaskPermissions,
  useToast,
} from '../components/tasks/taskHelpers';
import { api, type Epic, type Project, type Sprint, type SprintStatus } from '../lib/api';
import { buttonClass, errorMessage, inputClass } from '../lib/forms';
import { SPRINT_STATUS_CLASS } from '../lib/statusStyles';

const PLANNING_QUERIES = [['sprints'], ['epics'], ['tasks']];

/** "3 of 8 done" with a thin bar. */
export function Progress({ done, tasks }: { done: number; tasks: number }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap tabular-nums">
      <span className="h-1.5 w-16 overflow-hidden rounded-sm bg-line">
        <i
          className="block h-full bg-teal"
          style={{ width: `${tasks ? (100 * done) / tasks : 0}%` }}
        />
      </span>
      {done} of {tasks} done
    </span>
  );
}

const dates = (s: Sprint) =>
  s.startDate || s.endDate
    ? `${s.startDate ? dueLabel(s.startDate) : '…'} – ${s.endDate ? dueLabel(s.endDate) : '…'}`
    : '';

export function SprintDialog({
  sprint,
  projectId,
  onClose,
}: {
  sprint: Sprint | null;
  projectId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { manageableProjects } = useTaskPermissions();
  const [form, setForm] = useState({
    projectId: sprint?.projectId ?? projectId ?? '',
    name: sprint?.name ?? '',
    goal: sprint?.goal ?? '',
    startDate: sprint?.startDate?.slice(0, 10) ?? '',
    endDate: sprint?.endDate?.slice(0, 10) ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const project = form.projectId || manageableProjects[0]?.id || '';
  const save = useMutation({
    mutationFn: () => {
      const fields = {
        name: form.name,
        goal: form.goal || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      return sprint
        ? api(`/sprints/${sprint.id}`, { method: 'PATCH', body: JSON.stringify(fields) })
        : api('/sprints', {
            method: 'POST',
            body: JSON.stringify({ ...fields, projectId: project }),
          });
    },
    onSuccess: () => {
      PLANNING_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      onClose();
    },
  });
  return (
    <Dialog
      title={sprint ? `Edit ${sprint.name}` : 'New sprint'}
      onClose={onClose}
      onSave={() => save.mutate()}
      saving={save.isPending}
      error={save.error ? errorMessage(save.error) : null}
    >
      <Field label="Project">
        <select
          className={inputClass}
          value={project}
          disabled={!!sprint}
          onChange={(e) => set({ projectId: e.target.value })}
        >
          {(sprint ? [sprint.project] : manageableProjects).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input
          className={inputClass}
          value={form.name}
          placeholder="Sprint 1"
          autoFocus
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Start">
        <input
          type="date"
          className={inputClass}
          value={form.startDate}
          onChange={(e) => set({ startDate: e.target.value })}
        />
      </Field>
      <Field label="End">
        <input
          type="date"
          className={inputClass}
          value={form.endDate}
          min={form.startDate || undefined}
          onChange={(e) => set({ endDate: e.target.value })}
        />
      </Field>
      <Field label="Goal" full>
        <input
          className={inputClass}
          value={form.goal}
          placeholder="What this sprint should deliver"
          onChange={(e) => set({ goal: e.target.value })}
        />
      </Field>
    </Dialog>
  );
}

const EPIC_COLORS = ['#2f7d6d', '#3b6fb6', '#8a4fa3', '#c2571a', '#b8860b', '#b03a48'];

export function EpicDialog({
  epic,
  projectId,
  onClose,
}: {
  epic: Epic | null;
  projectId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { manageableProjects } = useTaskPermissions();
  const [form, setForm] = useState({
    projectId: epic?.projectId ?? projectId ?? '',
    name: epic?.name ?? '',
    description: epic?.description ?? '',
    color: epic?.color ?? EPIC_COLORS[0],
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const project = form.projectId || manageableProjects[0]?.id || '';
  const save = useMutation({
    mutationFn: () => {
      const fields = { name: form.name, description: form.description || null, color: form.color };
      return epic
        ? api(`/epics/${epic.id}`, { method: 'PATCH', body: JSON.stringify(fields) })
        : api('/epics', {
            method: 'POST',
            body: JSON.stringify({ ...fields, projectId: project }),
          });
    },
    onSuccess: () => {
      PLANNING_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      onClose();
    },
  });
  return (
    <Dialog
      title={epic ? `Edit ${epic.name}` : 'New epic'}
      onClose={onClose}
      onSave={() => save.mutate()}
      saving={save.isPending}
      error={save.error ? errorMessage(save.error) : null}
    >
      <Field label="Project">
        <select
          className={inputClass}
          value={project}
          disabled={!!epic}
          onChange={(e) => set({ projectId: e.target.value })}
        >
          {(epic ? [epic.project] : manageableProjects).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input
          className={inputClass}
          value={form.name}
          placeholder="Reporting"
          autoFocus
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Colour">
        <span className="flex items-center gap-1.5" role="radiogroup" aria-label="Colour">
          {EPIC_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={form.color === c}
              aria-label={c}
              className={`h-7 w-7 rounded-full border-2 ${form.color === c ? 'border-ink' : 'border-transparent'}`}
              style={{ background: c }}
              onClick={() => set({ color: c })}
            />
          ))}
        </span>
      </Field>
      <Field label="Description" full>
        <input
          className={inputClass}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
    </Dialog>
  );
}

/**
 * A project's Sprints view: every sprint it has had, completed ones included (the Backlog shows
 * only open sprints). Each sprint opens on the project board; managers start, complete and edit
 * them here too.
 */
export function SprintsPage({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [toastMessage, showToast] = useToast();
  const [editingSprint, setEditingSprint] = useState<Sprint | 'new' | null>(null);
  const [chartFor, setChartFor] = useState<string | null>(null);
  const { sprints } = usePlanningLookups();
  const { canManageProject } = useTaskPermissions();
  const manages = canManageProject(project.id);

  const refresh = () => PLANNING_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  const setStatus = useMutation({
    mutationFn: ({ sprint, status }: { sprint: Sprint; status: SprintStatus }) =>
      api(`/sprints/${sprint.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: (_r, { sprint, status }) => {
      refresh();
      showToast(
        status === 'ACTIVE'
          ? `${sprint.name} started`
          : `${sprint.name} complete. Unfinished tasks went back to the backlog.`,
      );
    },
    onError: (e) => showToast(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (sprint: Sprint) => api(`/sprints/${sprint.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      showToast('Deleted. Its tasks are kept.');
    },
    onError: (e) => showToast(errorMessage(e)),
  });

  // Active first, then planned, then complete.
  const rank: Record<SprintStatus, number> = { ACTIVE: 0, PLANNED: 1, CLOSED: 2 };
  const shownSprints = sprints
    .filter((s) => s.projectId === project.id)
    .sort((a, b) => rank[a.status] - rank[b.status]);
  // The burndown shows the chosen sprint, else the active one, else the latest with dates.
  const dated = shownSprints.filter((s) => s.startDate && s.endDate);
  const charted =
    dated.find((s) => s.id === chartFor) ??
    dated.find((s) => s.status === 'ACTIVE') ??
    [...dated].sort((a, b) => b.startDate!.localeCompare(a.startDate!))[0];

  const th =
    'border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-middle';

  return (
    <>
      <PageHeader title="Sprints">
        {manages && (
          <button
            type="button"
            className={buttonClass('primary')}
            onClick={() => setEditingSprint('new')}
          >
            New sprint
          </button>
        )}
      </PageHeader>

      {charted && (
        <section
          className="mb-4 min-w-0 rounded-lg border border-line bg-panel p-4 shadow-[0_1px_0_rgba(23,35,59,0.06)]"
          aria-labelledby="burndown-heading"
        >
          <h2 id="burndown-heading" className="mb-2 font-semibold">
            Burndown · {charted.name}
          </h2>
          <BurndownChart key={charted.id} sprintId={charted.id} />
        </section>
      )}

      <section
        className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]"
        aria-label="Sprints"
      >
        <p className="border-b border-line px-3 py-2.5 text-xs text-muted">
          One active sprint at a time. Completing a sprint sends its unfinished tasks back to the
          backlog.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>Sprint</th>
                <th className={th}>Dates</th>
                <th className={th}>Status</th>
                <th className={th}>Progress</th>
                <th className="border-b border-line" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shownSprints.map((s) => (
                <tr key={s.id}>
                  <td className={td}>
                    <Link
                      to={`/projects/${project.code}/board?sprint=${s.id}`}
                      className="font-medium hover:text-teal hover:underline"
                      title="Show this sprint on the board"
                    >
                      {s.name}
                    </Link>
                    {s.goal && <p className="text-xs text-muted">{s.goal}</p>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{dates(s)}</td>
                  <td className={td}>
                    <span
                      className={`rounded-[3px] px-[7px] py-0.5 text-[11px] font-semibold ${SPRINT_STATUS_CLASS[s.status]}`}
                    >
                      {SPRINT_STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className={td}>
                    <Progress done={s.done} tasks={s.tasks} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="flex items-center justify-end gap-1.5">
                      {s.startDate && s.endDate && (
                        <button
                          type="button"
                          className={`rounded-[3px] px-2 py-1 text-xs font-medium ${
                            charted?.id === s.id
                              ? 'bg-teal-soft text-teal'
                              : 'text-muted hover:bg-btn'
                          }`}
                          aria-pressed={charted?.id === s.id}
                          aria-label={`Show the burndown of ${s.name}`}
                          onClick={() => setChartFor(s.id)}
                        >
                          Burndown
                        </button>
                      )}
                      {manages && (
                        <>
                          {s.status === 'PLANNED' && (
                            <button
                              type="button"
                              className={buttonClass()}
                              disabled={setStatus.isPending}
                              onClick={() => setStatus.mutate({ sprint: s, status: 'ACTIVE' })}
                            >
                              Start
                            </button>
                          )}
                          {s.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className={buttonClass()}
                              disabled={setStatus.isPending}
                              onClick={() =>
                                window.confirm(
                                  `Complete ${s.name}? ${s.tasks - s.done} unfinished tasks go back to the backlog.`,
                                ) && setStatus.mutate({ sprint: s, status: 'CLOSED' })
                              }
                            >
                              Complete
                            </button>
                          )}
                          <RowActions
                            onEdit={() => setEditingSprint(s)}
                            onDelete={() => remove.mutate(s)}
                            deleteConfirm={`Delete ${s.name}? Its tasks are kept, out of any sprint.`}
                            busy={remove.isPending}
                          />
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {!shownSprints.length && (
                <tr>
                  <td colSpan={5} className="p-2.5 text-center text-xs text-muted">
                    No sprints yet.{manages ? ' Use New sprint to plan one.' : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingSprint && (
        <SprintDialog
          sprint={editingSprint === 'new' ? null : editingSprint}
          projectId={project.id}
          onClose={() => setEditingSprint(null)}
        />
      )}
      <Toast message={toastMessage} />
    </>
  );
}
