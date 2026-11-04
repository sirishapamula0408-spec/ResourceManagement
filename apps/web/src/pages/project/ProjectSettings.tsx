import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { RowActions } from '../../components/RowActions';
import { Avatar, EpicChip, Toast } from '../../components/tasks/taskUi';
import {
  dueLabel,
  usePlanningLookups,
  useTaskLookups,
  useTaskPermissions,
  useToast,
} from '../../components/tasks/taskHelpers';
import { api, canManageStaffing, type Epic } from '../../lib/api';
import { buttonClass, errorMessage } from '../../lib/forms';
import { ProjectDialog } from '../ProjectsPage';
import { PROJECT_STATUS_LABEL } from '../../lib/statusStyles';
import { EpicDialog, Progress } from '../SprintsPage';
import { useProject } from './useProject';

const card = 'rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]';

/**
 * Project settings: details and team (admins, delivery heads and resource managers edit them,
 * as on the Projects page) and epics (admins and the project's PMs).
 */
export function ProjectSettings() {
  const project = useProject();
  const qc = useQueryClient();
  const [toastMessage, showToast] = useToast();
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingEpic, setEditingEpic] = useState<Epic | 'new' | null>(null);
  const { people, personNames } = useTaskLookups();
  const { epics } = usePlanningLookups();
  const { canManageProject } = useTaskPermissions();
  const staffing = canManageStaffing();
  const managesEpics = canManageProject(project.id);
  const projectEpics = epics.filter((e) => e.projectId === project.id);

  const removeEpic = useMutation({
    mutationFn: (e: Epic) => api(`/epics/${e.id}`, { method: 'DELETE' }),
    onSuccess: (_r, e) => {
      for (const queryKey of [['epics'], ['tasks']]) qc.invalidateQueries({ queryKey });
      showToast(`${e.name} deleted. Its tasks are kept.`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });

  const details: [string, React.ReactNode][] = [
    ['Key', <b key="k">{project.code}</b>],
    ['Name', project.name],
    ['Client', project.client ?? '—'],
    ['Status', PROJECT_STATUS_LABEL[project.status]],
    ['Owner', project.owner?.name ?? '—'],
    ['Billing', project.billable ? 'Billable' : 'Non-billable'],
    ['Start', project.startDate ? dueLabel(project.startDate) : '—'],
    ['End', project.endDate ? dueLabel(project.endDate) : '—'],
    ['Description', project.description ?? '—'],
  ];
  const th = 'border-b border-line px-3 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-3 py-2 align-middle';

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="details-heading">
          <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
            <h2 id="details-heading" className="flex-1 font-semibold">
              Details
            </h2>
            {staffing && (
              <button
                type="button"
                className={buttonClass()}
                onClick={() => setEditingDetails(true)}
              >
                Edit details
              </button>
            )}
          </header>
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 px-3 py-3 text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {!staffing && (
            <p className="px-3 pb-3 text-xs text-muted">
              Admins, delivery heads and resource managers can edit project details.
            </p>
          )}
        </section>

        <section className={card} aria-labelledby="members-heading">
          <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
            <h2 id="members-heading" className="flex-1 font-semibold">
              Team members · {project.members.length}
            </h2>
            {staffing && (
              <button
                type="button"
                className={buttonClass()}
                onClick={() => setEditingDetails(true)}
              >
                Manage team
              </button>
            )}
          </header>
          <ul className="divide-y divide-line">
            {project.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                <Avatar name={m.name} allNames={personNames} size={26} />
                <span className="flex-1">{m.name}</span>
                {m.id === project.owner?.id && <span className="text-xs text-muted">Owner</span>}
              </li>
            ))}
            {!project.members.length && (
              <li className="px-3 py-3 text-sm text-muted">No one is on this project yet.</li>
            )}
          </ul>
        </section>

        <section className={`${card} lg:col-span-2`} aria-labelledby="epics-heading">
          <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
            <h2 id="epics-heading" className="font-semibold">
              Epics
            </h2>
            <p className="flex-1 text-xs text-muted">Group related tasks across sprints.</p>
            {managesEpics && (
              <button
                type="button"
                className={buttonClass('primary')}
                onClick={() => setEditingEpic('new')}
              >
                New epic
              </button>
            )}
          </header>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>Epic</th>
                <th className={th}>Description</th>
                <th className={th}>Progress</th>
                <th className="border-b border-line" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {projectEpics.map((e) => (
                <tr key={e.id}>
                  <td className={td}>
                    <EpicChip epic={e} />
                  </td>
                  <td className={`${td} text-muted`}>{e.description}</td>
                  <td className={td}>
                    <Progress done={e.done} tasks={e.tasks} />
                  </td>
                  <td className={td}>
                    {managesEpics && (
                      <RowActions
                        onEdit={() => setEditingEpic(e)}
                        onDelete={() => removeEpic.mutate(e)}
                        deleteConfirm={`Delete ${e.name}? Its tasks are kept, without an epic.`}
                        busy={removeEpic.isPending}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {!projectEpics.length && (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-xs text-muted">
                    No epics yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {editingDetails && (
        <ProjectDialog project={project} people={people} onClose={() => setEditingDetails(false)} />
      )}
      {editingEpic && (
        <EpicDialog
          epic={editingEpic === 'new' ? null : editingEpic}
          projectId={project.id}
          onClose={() => setEditingEpic(null)}
        />
      )}
      <Toast message={toastMessage} />
    </>
  );
}
