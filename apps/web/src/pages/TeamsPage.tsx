import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Checklist, Dialog, Field } from '../components/Dialog';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { RowActions } from '../components/RowActions';
import { Avatar, Toast } from '../components/tasks/taskUi';
import { hours, useTaskLookups, useToast } from '../components/tasks/taskHelpers';
import {
  api,
  auth,
  canManageStaffing,
  isTeamMember,
  ROLE_LABEL,
  type DashboardOverview,
  type Department,
  type Person,
  type Project,
  type Role,
  type Task,
  type Team,
} from '../lib/api';
import { buttonClass, errorMessage, inputClass, STAFFING_QUERIES } from '../lib/forms';
import { usePagination } from '../lib/pagination';
import { fmt, identityColor } from '../lib/theme';

/** Least to most access, for the role picker. */
const ROLE_ORDER: Role[] = ['MEMBER', 'PM', 'RESOURCE_MANAGER', 'DELIVERY_HEAD', 'ADMIN'];

// Same rule as the API: 8+ characters with a letter and a number.
const PASSWORD_PATTERN = '(?=.*[A-Za-z])(?=.*[0-9]).{8,}';
const PASSWORD_HINT = 'At least 8 characters, including a letter and a number';

function PersonDialog({
  person,
  projects,
  departments,
  onClose,
}: {
  person: Person | null;
  projects: Project[];
  departments: Department[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isAdmin = auth.getUser()?.role === 'ADMIN';
  const [form, setForm] = useState({
    name: person?.name ?? '',
    email: person?.email ?? '',
    title: person?.title ?? '',
    department: person?.department?.name ?? '',
    weeklyCapacityHours: person ? hours(person.weeklyCapacityHours) : 40,
    role: person?.role ?? ('MEMBER' as Role),
    password: '',
  });
  const [projectIds, setProjectIds] = useState(person?.projects.map((p) => p.id) ?? []);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const done = () => {
    STAFFING_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      // Only admins may set roles; the API rejects a role sent by anyone else.
      const { role, password, ...rest } = form;
      const body = JSON.stringify({
        ...rest,
        title: rest.title || null,
        department: rest.department || null,
        ...(isAdmin ? { role } : {}),
        // Required for a new person; on edit, only sent to reset it.
        ...(password ? { password } : {}),
      });
      const saved = person
        ? await api<Person>(`/people/${person.id}`, { method: 'PATCH', body })
        : await api<Person>('/people', { method: 'POST', body });
      await api(`/people/${saved.id}/projects`, {
        method: 'PUT',
        body: JSON.stringify({ projectIds }),
      });
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api(`/people/${person!.id}`, { method: 'DELETE' }),
    onSuccess: done,
  });

  return (
    <Dialog
      title={person ? 'Edit person' : 'Add person'}
      onClose={onClose}
      onSave={() => save.mutate()}
      onDelete={person ? () => remove.mutate() : undefined}
      deleteLabel="Remove from team"
      deleteConfirm={`Remove ${person?.name ?? 'this person'} from the team? Their open tasks become unassigned.`}
      saving={save.isPending || remove.isPending}
      error={save.error || remove.error ? errorMessage(save.error ?? remove.error) : null}
    >
      <Field label="Name" full>
        <input
          className={inputClass}
          value={form.name}
          required
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          className={inputClass}
          value={form.email}
          required
          onChange={(e) => set({ email: e.target.value })}
        />
      </Field>
      <Field label="Job title">
        <input
          className={inputClass}
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label="Department">
        <input
          className={inputClass}
          list="departments"
          value={form.department}
          onChange={(e) => set({ department: e.target.value })}
        />
        <datalist id="departments">
          {departments.map((d) => (
            <option key={d.id} value={d.name} />
          ))}
        </datalist>
      </Field>
      <Field label="Weekly capacity (hours)">
        <input
          type="number"
          min={1}
          max={80}
          className={inputClass}
          value={form.weeklyCapacityHours}
          onChange={(e) => set({ weeklyCapacityHours: Number(e.target.value) })}
        />
      </Field>
      <Field label={isAdmin ? 'App role' : 'App role (admins only)'}>
        <select
          className={inputClass}
          value={form.role}
          disabled={!isAdmin}
          onChange={(e) => set({ role: e.target.value as Role })}
        >
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={person ? 'Reset password (optional)' : 'Temporary password'}>
        <input
          type="text"
          autoComplete="off"
          className={inputClass}
          value={form.password}
          required={!person}
          pattern={PASSWORD_PATTERN}
          title={PASSWORD_HINT}
          placeholder={person ? 'Leave blank to keep their password' : PASSWORD_HINT}
          onChange={(e) => set({ password: e.target.value })}
        />
      </Field>
      <p className="self-end pb-2 text-xs text-muted">
        {person
          ? 'A new password must be changed at their next sign-in.'
          : 'Share it with them; they choose their own at first sign-in.'}
      </p>
      <Checklist
        label="Projects"
        options={projects.map((p) => ({
          id: p.id,
          label: `${p.code} · ${p.name}`,
          hint: p.client ?? undefined,
        }))}
        selected={projectIds}
        onChange={setProjectIds}
        empty="Add a project on the Projects page first."
      />
    </Dialog>
  );
}

/** Colour of the load bar: over capacity, healthy, moderate, low (prototype bands). */
const loadColor = (pct: number) =>
  pct > 100
    ? 'var(--color-plum)'
    : pct >= 80
      ? 'var(--color-green)'
      : pct >= 50
        ? 'var(--color-teal)'
        : 'var(--color-amber)';

export function TeamsPage() {
  const editable = canManageStaffing();
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const { people, projects, personNames } = useTaskLookups();
  const codes = projects.map((p) => p.code);
  const me = auth.getUser();
  // A team member sees only their own row (the API also limits who is returned).
  const member = isTeamMember();
  const shownPeople = member ? people.filter((p) => p.id === me?.id) : people;
  const paged = usePagination(shownPeople, 10, '');
  const qc = useQueryClient();
  const [toastMessage, showToast] = useToast();
  const remove = useMutation({
    mutationFn: (p: Person) => api(`/people/${p.id}`, { method: 'DELETE' }),
    onSuccess: (_r, p) => {
      STAFFING_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      showToast(`${p.name} removed from the team`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });
  // Same rules as the API: never yourself, and only an admin removes an admin.
  const canEditPerson = (p: Person) => editable && (p.role !== 'ADMIN' || me?.role === 'ADMIN');
  const canRemove = (p: Person) => canEditPerson(p) && p.id !== me?.id;

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api<Department[]>('/people/departments'),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });
  // This week's utilization per person, from the same rules as the dashboard.
  const { data: thisWeek } = useQuery({
    queryKey: ['dashboard', 'this-week'],
    queryFn: () =>
      api<DashboardOverview['heatmap']>(
        `/dashboard/heatmap?weeks=1&from=${new Date().toISOString().slice(0, 10)}`,
      ),
  });
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => api<Team[]>('/teams'),
  });

  const loadOf = (id: string) => thisWeek?.rows.find((r) => r.personId === id)?.cells[0]?.pct ?? 0;
  const openTasksOf = (id: string) =>
    tasks.filter((t) => t.assignee?.id === id && t.status !== 'DONE').length;

  const th =
    'border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-middle';

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={
          editable
            ? undefined
            : member
              ? 'Your capacity and this week’s load'
              : 'Only admins, delivery heads and resource managers can add, edit or remove people.'
        }
      >
        {editable && (
          <button className={buttonClass('primary')} onClick={() => setEditing('new')}>
            Add person
          </button>
        )}
      </PageHeader>

      <section className="mb-4 min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <h2 className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-sm font-semibold">
          People
          <span className="text-xs font-normal text-muted">this week’s load against capacity</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {[
                  'Name',
                  'Title',
                  'Department',
                  'Capacity',
                  'This week',
                  'Open tasks',
                  'Projects',
                  ...(editable ? [''] : []),
                ].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.items.map((p) => {
                const pct = loadOf(p.id);
                return (
                  <tr
                    key={p.id}
                    className={canEditPerson(p) ? 'cursor-pointer hover:[&>td]:bg-panel2' : ''}
                    onClick={canEditPerson(p) ? () => setEditing(p) : undefined}
                  >
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <Avatar name={p.name} allNames={personNames} />
                        <span>
                          {p.name}
                          {p.role !== 'MEMBER' && (
                            <small className="ml-1.5 text-[11px] text-muted">
                              {ROLE_LABEL[p.role]}
                            </small>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className={td}>{p.title}</td>
                    <td className={td}>{p.department?.name}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {fmt(hours(p.weeklyCapacityHours))}h/wk
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 min-w-[90px] flex-1 overflow-hidden rounded bg-panel2">
                          <i
                            className="block h-full"
                            style={{ width: `${Math.min(100, pct)}%`, background: loadColor(pct) }}
                          />
                        </div>
                        <b className="min-w-11 text-right">{fmt(pct)}%</b>
                      </div>
                    </td>
                    <td className={td}>{openTasksOf(p.id)}</td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {p.projects.map((pr) => (
                          <span
                            key={pr.id}
                            title={pr.name}
                            className="rounded-[3px] border border-line px-1.5 py-px text-[11px] font-semibold"
                            style={{ borderLeft: `3px solid ${identityColor(pr.code, codes)}` }}
                          >
                            {pr.code}
                          </span>
                        ))}
                        {!p.projects.length && <span className="text-xs text-muted">None</span>}
                      </div>
                    </td>
                    {editable && (
                      <td className={td}>
                        <RowActions
                          onEdit={canEditPerson(p) ? () => setEditing(p) : undefined}
                          onDelete={canRemove(p) ? () => remove.mutate(p) : undefined}
                          deleteLabel="Remove"
                          deleteConfirm={`Remove ${p.name} from the team? Their open tasks become unassigned.`}
                          busy={remove.isPending}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
              {!people.length && (
                <tr>
                  <td colSpan={8} className="p-2.5 text-center text-xs text-muted">
                    No people yet. Add your team to start planning capacity.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} noun="people" />
      </section>

      <section className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <h2 className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-sm font-semibold">
          Teams
          <span className="text-xs font-normal text-muted">groups across projects</span>
        </h2>
        <div className="grid gap-3 px-4 py-3 md:grid-cols-2 xl:grid-cols-4">
          {teams.map((team) => (
            <div key={team.id} className="rounded-md border border-line bg-panel2 p-3">
              <div className="font-semibold">{team.name}</div>
              <div className="mb-2 text-xs text-muted">{team.description}</div>
              <ul className="flex flex-col gap-1.5">
                {team.members.map((m) => (
                  <li key={m.person.id} className="flex items-center gap-2">
                    <Avatar name={m.person.name} allNames={personNames} size={22} />
                    {m.person.name}
                    {m.isLead && <span className="text-xs font-semibold text-teal">Lead</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <PersonDialog
          person={editing === 'new' ? null : editing}
          projects={projects}
          departments={departments}
          onClose={() => setEditing(null)}
        />
      )}
      <Toast message={toastMessage} />
    </>
  );
}
