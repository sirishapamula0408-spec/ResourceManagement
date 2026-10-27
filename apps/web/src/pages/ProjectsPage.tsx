import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Checklist, Dialog, Field } from '../components/Dialog';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { RowActions } from '../components/RowActions';
import { Toast } from '../components/tasks/taskUi';
import { Avatar } from '../components/tasks/taskUi';
import { useTaskLookups, useToast } from '../components/tasks/taskHelpers';
import {
  api,
  canManageStaffing,
  isSales,
  isTeamMember,
  type Person,
  type Project,
  type ProjectStatus,
} from '../lib/api';
import { buttonClass, errorMessage, inputClass, STAFFING_QUERIES } from '../lib/forms';
import { usePagination } from '../lib/pagination';
import { fmt, identityColor } from '../lib/theme';

const STATUSES: [ProjectStatus, string][] = [
  ['PLANNED', 'Planned'],
  ['ACTIVE', 'Active'],
  ['ON_HOLD', 'On hold'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
];
const STATUS_LABEL = Object.fromEntries(STATUSES) as Record<ProjectStatus, string>;
const STATUS_CLASS: Record<ProjectStatus, string> = {
  PLANNED: 'bg-blue-soft',
  ACTIVE: 'bg-green-soft',
  ON_HOLD: 'bg-amber-soft',
  COMPLETED: 'bg-panel2 border border-line',
  CANCELLED: 'bg-panel2 border border-line text-muted',
};

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function ProjectDialog({
  project,
  people,
  onClose,
}: {
  project: Project | null;
  people: Person[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: project?.code ?? '',
    name: project?.name ?? '',
    client: project?.client ?? '',
    billable: project?.billable ?? true,
    status: project?.status ?? ('PLANNED' as ProjectStatus),
    ownerId: project?.owner?.id ?? '',
    startDate: dateInput(project?.startDate ?? null),
    endDate: dateInput(project?.endDate ?? null),
    description: project?.description ?? '',
  });
  const [memberIds, setMemberIds] = useState(project?.members.map((m) => m.id) ?? []);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const done = () => {
    STAFFING_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        ...form,
        client: form.client || null,
        ownerId: form.ownerId || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        description: form.description || null,
      });
      const saved = project
        ? await api<Project>(`/projects/${project.id}`, { method: 'PATCH', body })
        : await api<Project>('/projects', { method: 'POST', body });
      await api(`/projects/${saved.id}/members`, {
        method: 'PUT',
        body: JSON.stringify({ personIds: memberIds }),
      });
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api(`/projects/${project!.id}`, { method: 'DELETE' }),
    onSuccess: done,
  });

  return (
    <Dialog
      title={project ? `${project.code} · Edit project` : 'Add project'}
      onClose={onClose}
      onSave={() => save.mutate()}
      onDelete={project ? () => remove.mutate() : undefined}
      deleteConfirm="Delete this project? This can’t be undone."
      saving={save.isPending || remove.isPending}
      error={save.error || remove.error ? errorMessage(save.error ?? remove.error) : null}
    >
      <Field label="Key">
        <input
          className={`${inputClass} uppercase`}
          value={form.code}
          maxLength={16}
          required
          onChange={(e) => set({ code: e.target.value })}
        />
      </Field>
      <Field label="Name">
        <input
          className={inputClass}
          value={form.name}
          required
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Client">
        <input
          className={inputClass}
          value={form.client}
          onChange={(e) => set({ client: e.target.value })}
        />
      </Field>
      <Field label="Status">
        <select
          className={inputClass}
          value={form.status}
          onChange={(e) => set({ status: e.target.value as ProjectStatus })}
        >
          {STATUSES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Owner">
        <select
          className={inputClass}
          value={form.ownerId}
          onChange={(e) => set({ ownerId: e.target.value })}
        >
          <option value="">No owner</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm sm:mt-5">
        <input
          type="checkbox"
          checked={form.billable}
          onChange={(e) => set({ billable: e.target.checked })}
        />
        Billable to client
      </label>
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
      <Field label="Description" full>
        <textarea
          className={inputClass}
          rows={2}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
      <Checklist
        label="Team members"
        options={people.map((p) => ({
          id: p.id,
          label: p.name,
          hint: [p.title, p.department?.name].filter(Boolean).join(' · '),
        }))}
        selected={memberIds}
        onChange={setMemberIds}
        empty="Add people on the Team page first."
      />
    </Dialog>
  );
}

function MemberStack({ members, allNames }: { members: Project['members']; allNames: string[] }) {
  const shown = members.slice(0, 5);
  return (
    <div className="flex items-center" title={members.map((m) => m.name).join(', ')}>
      {shown.map((m) => (
        <span key={m.id} className="mr-0.5 rounded-full">
          <Avatar name={m.name} allNames={allNames} size={24} />
        </span>
      ))}
      {members.length > shown.length && (
        <span className="ml-1.5 text-xs text-muted">+{members.length - shown.length}</span>
      )}
      {!members.length && <span className="text-xs text-muted">No one yet</span>}
    </div>
  );
}

export function ProjectsPage() {
  const editable = canManageStaffing();
  const sales = isSales();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const { people, personNames } = useTaskLookups();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const codes = projects.map((p) => p.code);
  const paged = usePagination(projects, 10, '');
  const qc = useQueryClient();
  const [toastMessage, showToast] = useToast();
  const remove = useMutation({
    mutationFn: (p: Project) => api(`/projects/${p.id}`, { method: 'DELETE' }),
    onSuccess: (_r, p) => {
      STAFFING_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      showToast(`${p.code} deleted`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });

  const th =
    'border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-middle';

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={
          editable
            ? undefined
            : isTeamMember()
              ? 'Projects you are on'
              : 'Only admins, delivery heads and resource managers can add, edit or delete projects.'
        }
      >
        {editable && (
          <button className={buttonClass('primary')} onClick={() => setEditing('new')}>
            Add project
          </button>
        )}
      </PageHeader>
      <section className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {[
                  'Key',
                  'Name',
                  'Client',
                  'Billing',
                  'Status',
                  'Owner',
                  // Sales users see client-facing facts only (the API leaves the rest out).
                  ...(sales ? [] : ['Team', 'Open tasks', 'Hours logged / estimated']),
                  ...(editable ? [''] : []),
                ].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="p-2.5 text-center text-xs text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {paged.items.map((p) => (
                <tr
                  key={p.id}
                  className={editable ? 'cursor-pointer hover:[&>td]:bg-panel2' : ''}
                  onClick={editable ? () => setEditing(p) : undefined}
                >
                  <td className={td}>
                    <i
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] align-[-1px]"
                      style={{ background: identityColor(p.code, codes) }}
                    />
                    <b>{p.code}</b>
                  </td>
                  <td className={td}>{p.name}</td>
                  <td className={td}>{p.client ?? <span className="text-muted">—</span>}</td>
                  <td className={td}>{p.billable ? 'Billable' : 'Non-billable'}</td>
                  <td className={td}>
                    <span
                      className={`rounded-[3px] px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_CLASS[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className={td}>{p.owner?.name ?? <span className="text-muted">—</span>}</td>
                  {!sales && (
                    <>
                      <td className={td}>
                        <MemberStack members={p.members} allNames={personNames} />
                      </td>
                      <td className={td}>{p.openTasks}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {fmt(p.loggedHours)} / {fmt(p.estimateHours)}h
                      </td>
                    </>
                  )}
                  {editable && (
                    <td className={td}>
                      <RowActions
                        onEdit={() => setEditing(p)}
                        onDelete={() => remove.mutate(p)}
                        deleteConfirm={`Delete project ${p.code}? This can’t be undone.`}
                        busy={remove.isPending}
                      />
                    </td>
                  )}
                </tr>
              ))}
              {!isLoading && !projects.length && (
                <tr>
                  <td colSpan={10} className="p-2.5 text-center text-xs text-muted">
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} noun="projects" />
      </section>
      {editing && (
        <ProjectDialog
          project={editing === 'new' ? null : editing}
          people={people}
          onClose={() => setEditing(null)}
        />
      )}
      <Toast message={toastMessage} />
    </>
  );
}
