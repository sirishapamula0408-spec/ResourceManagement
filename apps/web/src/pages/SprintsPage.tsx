import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Field } from '../components/Dialog';
import { PageHeader } from '../components/PageHeader';
import { RowActions } from '../components/RowActions';
import { EpicChip, Toast } from '../components/tasks/taskUi';
import {
  dueLabel,
  presetTaskFilter,
  SPRINT_STATUS_LABEL,
  usePlanningLookups,
  useTaskLookups,
  useTaskPermissions,
  useToast,
} from '../components/tasks/taskHelpers';
import { api, type Epic, type Sprint, type SprintStatus } from '../lib/api';
import { buttonClass, errorMessage, inputClass } from '../lib/forms';

const PLANNING_QUERIES = [['sprints'], ['epics'], ['tasks']];

const SPRINT_STATUS_CLASS: Record<SprintStatus, string> = {
  PLANNED: 'bg-blue-soft',
  ACTIVE: 'bg-amber-soft',
  CLOSED: 'bg-green-soft',
};

/** "3 of 8 done" with a thin bar. */
function Progress({ done, tasks }: { done: number; tasks: number }) {
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

function SprintDialog({
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

function EpicDialog({
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

/** Sprints and epics per project (M2): plan, start and complete sprints; group tasks in epics. */
export function SprintsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [toastMessage, showToast] = useToast();
  const [projectId, setProjectId] = useState('');
  const [editingSprint, setEditingSprint] = useState<Sprint | 'new' | null>(null);
  const [editingEpic, setEditingEpic] = useState<Epic | 'new' | null>(null);
  const { projects } = useTaskLookups();
  const { sprints, epics } = usePlanningLookups();
  const { canManageProject, manageableProjects } = useTaskPermissions();

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
    mutationFn: (path: string) => api(path, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      showToast('Deleted. Its tasks are kept.');
    },
    onError: (e) => showToast(errorMessage(e)),
  });

  const inProject = <T extends { projectId: string }>(rows: T[]) =>
    projectId ? rows.filter((r) => r.projectId === projectId) : rows;
  // Active first, then planned, then complete.
  const rank: Record<SprintStatus, number> = { ACTIVE: 0, PLANNED: 1, CLOSED: 2 };
  const shownSprints = inProject(sprints).sort((a, b) => rank[a.status] - rank[b.status]);
  const shownEpics = inProject(epics);
  const canCreate = manageableProjects.length > 0;

  const openTasks = (patch: { sprintId?: string; epicId?: string }, onProject: string) => {
    presetTaskFilter({ ...patch, projectId: onProject });
    navigate('/board');
  };

  const th =
    'border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-middle';
  const card =
    'min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]';
  const link = 'font-medium text-left hover:text-teal hover:underline';

  return (
    <>
      <PageHeader title="Sprints and epics">
        <select
          className="rounded-md border border-line bg-panel px-2.5 py-1.5"
          aria-label="Project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </PageHeader>

      <section className={`${card} mb-4`} aria-labelledby="sprints-heading">
        <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
          <h2 id="sprints-heading" className="font-semibold">
            Sprints
          </h2>
          <p className="flex-1 text-xs text-muted">
            One active sprint per project. Completing a sprint sends its unfinished tasks back to
            the backlog.
          </p>
          {canCreate && (
            <button
              type="button"
              className={buttonClass('primary')}
              onClick={() => setEditingSprint('new')}
            >
              New sprint
            </button>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>Sprint</th>
                <th className={th}>Project</th>
                <th className={th}>Dates</th>
                <th className={th}>Status</th>
                <th className={th}>Progress</th>
                <th className="border-b border-line" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shownSprints.map((s) => {
                const manages = canManageProject(s.projectId);
                return (
                  <tr key={s.id}>
                    <td className={td}>
                      <button
                        type="button"
                        className={link}
                        onClick={() => openTasks({ sprintId: s.id }, s.projectId)}
                      >
                        {s.name}
                      </button>
                      {s.goal && <p className="text-xs text-muted">{s.goal}</p>}
                    </td>
                    <td className={td}>{s.project.name}</td>
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
                        {manages && s.status === 'PLANNED' && (
                          <button
                            type="button"
                            className={buttonClass()}
                            disabled={setStatus.isPending}
                            onClick={() => setStatus.mutate({ sprint: s, status: 'ACTIVE' })}
                          >
                            Start
                          </button>
                        )}
                        {manages && s.status === 'ACTIVE' && (
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
                        {manages && (
                          <RowActions
                            onEdit={() => setEditingSprint(s)}
                            onDelete={() => remove.mutate(`/sprints/${s.id}`)}
                            deleteConfirm={`Delete ${s.name}? Its tasks are kept, out of any sprint.`}
                            busy={remove.isPending}
                          />
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!shownSprints.length && (
                <tr>
                  <td colSpan={6} className="p-2.5 text-center text-xs text-muted">
                    No sprints yet.{canCreate ? ' Use New sprint to plan one.' : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card} aria-labelledby="epics-heading">
        <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
          <h2 id="epics-heading" className="font-semibold">
            Epics
          </h2>
          <p className="flex-1 text-xs text-muted">
            Group related tasks across sprints. Set a task’s epic in the task dialog.
          </p>
          {canCreate && (
            <button
              type="button"
              className={buttonClass('primary')}
              onClick={() => setEditingEpic('new')}
            >
              New epic
            </button>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>Epic</th>
                <th className={th}>Project</th>
                <th className={th}>Description</th>
                <th className={th}>Progress</th>
                <th className="border-b border-line" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shownEpics.map((ep) => (
                <tr key={ep.id}>
                  <td className={td}>
                    <button
                      type="button"
                      className="hover:opacity-80"
                      title="Show this epic’s tasks on the board"
                      onClick={() => openTasks({ epicId: ep.id }, ep.projectId)}
                    >
                      <EpicChip epic={ep} />
                    </button>
                  </td>
                  <td className={td}>{ep.project.name}</td>
                  <td className={`${td} text-muted`}>{ep.description}</td>
                  <td className={td}>
                    <Progress done={ep.done} tasks={ep.tasks} />
                  </td>
                  <td className={td}>
                    {canManageProject(ep.projectId) && (
                      <RowActions
                        onEdit={() => setEditingEpic(ep)}
                        onDelete={() => remove.mutate(`/epics/${ep.id}`)}
                        deleteConfirm={`Delete ${ep.name}? Its tasks are kept, without an epic.`}
                        busy={remove.isPending}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {!shownEpics.length && (
                <tr>
                  <td colSpan={5} className="p-2.5 text-center text-xs text-muted">
                    No epics yet.{canCreate ? ' Use New epic to add one.' : ''}
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
          projectId={projectId && canManageProject(projectId) ? projectId : ''}
          onClose={() => setEditingSprint(null)}
        />
      )}
      {editingEpic && (
        <EpicDialog
          epic={editingEpic === 'new' ? null : editingEpic}
          projectId={projectId && canManageProject(projectId) ? projectId : ''}
          onClose={() => setEditingEpic(null)}
        />
      )}
      <Toast message={toastMessage} />
    </>
  );
}
