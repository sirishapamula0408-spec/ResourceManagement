import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Checklist, Dialog, Field } from '../components/Dialog';
import { DownloadMenu } from '../components/DownloadMenu';
import { LeaveSection } from '../components/LeaveSection';
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
import { downloadText } from '../lib/reportCsv';
import {
  downloadTeamsPptx,
  downloadTeamsXlsx,
  teamsReportCsv,
  teamsReportFileName,
} from '../lib/teamsReport';
import { fmt, identityColor } from '../lib/theme';

/** Least to most access, for the role picker. */
const ROLE_ORDER: Role[] = [
  'VIEWER',
  'MEMBER',
  'SALES',
  'PM',
  'RESOURCE_MANAGER',
  'DELIVERY_HEAD',
  'ADMIN',
];

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
  const resetMfa = useMutation({
    mutationFn: () => api(`/people/${person!.id}/mfa`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people'] }),
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
      error={
        save.error || remove.error || resetMfa.error
          ? errorMessage(save.error ?? remove.error ?? resetMfa.error)
          : null
      }
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
      {person && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted sm:col-span-2">
          <span>
            Two-step verification:{' '}
            <b className="text-ink">
              {resetMfa.isSuccess ? 'Off (reset)' : person.mfaEnabled ? 'On' : 'Off'}
            </b>
          </span>
          {isAdmin && person.mfaEnabled && !resetMfa.isSuccess && (
            <button
              type="button"
              className={buttonClass()}
              disabled={resetMfa.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Reset two-step verification for ${person.name}? They sign in with just their password until they set it up again.`,
                  )
                )
                  resetMfa.mutate();
              }}
            >
              Reset two-step verification
            </button>
          )}
        </div>
      )}
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

function TeamDialog({
  team,
  people,
  onClose,
}: {
  team: Team | null;
  people: Person[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [memberIds, setMemberIds] = useState(team?.members.map((m) => m.person.id) ?? []);
  const [leadIds, setLeadIds] = useState(
    team?.members.filter((m) => m.isLead).map((m) => m.person.id) ?? [],
  );
  const byId = new Map(people.map((p) => [p.id, p]));

  const done = () => {
    qc.invalidateQueries({ queryKey: ['teams'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        name,
        description: description || null,
        members: memberIds.map((personId) => ({ personId, isLead: leadIds.includes(personId) })),
      });
      return team
        ? api<Team>(`/teams/${team.id}`, { method: 'PATCH', body })
        : api<Team>('/teams', { method: 'POST', body });
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api(`/teams/${team!.id}`, { method: 'DELETE' }),
    onSuccess: done,
  });

  return (
    <Dialog
      title={team ? 'Edit team' : 'Add team'}
      onClose={onClose}
      onSave={() => save.mutate()}
      onDelete={team ? () => remove.mutate() : undefined}
      deleteLabel="Delete team"
      deleteConfirm={`Delete the team ${team?.name ?? ''}? The people stay on the Team page.`}
      saving={save.isPending || remove.isPending}
      error={save.error || remove.error ? errorMessage(save.error ?? remove.error) : null}
    >
      <Field label="Team name">
        <input
          className={inputClass}
          value={name}
          required
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Description">
        <input
          className={inputClass}
          value={description}
          maxLength={300}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Checklist
        label="Members"
        options={people.map((p) => ({ id: p.id, label: p.name, hint: p.title ?? undefined }))}
        selected={memberIds}
        onChange={(ids) => {
          setMemberIds(ids);
          // A lead must be a member.
          setLeadIds((leads) => leads.filter((id) => ids.includes(id)));
        }}
        empty="Add people above first."
      />
      <Checklist
        label="Leads"
        options={memberIds.flatMap((id) => {
          const p = byId.get(id);
          return p ? [{ id, label: p.name }] : [];
        })}
        selected={leadIds}
        onChange={setLeadIds}
        empty="Pick members first; leads are chosen from them."
      />
    </Dialog>
  );
}

type SortKey = 'name' | 'title' | 'department' | 'capacity' | 'load' | 'openTasks' | 'projects';
const COLUMNS: [SortKey, string][] = [
  ['name', 'Name'],
  ['title', 'Title'],
  ['department', 'Department'],
  ['capacity', 'Capacity'],
  ['load', 'This week'],
  ['openTasks', 'Open tasks'],
  ['projects', 'Projects'],
];

const searchControl = 'min-w-[200px] rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs';

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
  const [editingTeam, setEditingTeam] = useState<Team | 'new' | null>(null);
  const { people, projects, personNames } = useTaskLookups();
  const codes = projects.map((p) => p.code);
  const me = auth.getUser();
  // A team member sees only their own row (the API also limits who is returned).
  const member = isTeamMember();
  const shownPeople = member ? people.filter((p) => p.id === me?.id) : people;
  const [search, setSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
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
  const removeTeams = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ deleted: number }>('/teams/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: ({ deleted }) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      setSelectedTeamIds(new Set());
      showToast(`Deleted ${deleted} ${deleted === 1 ? 'team' : 'teams'}`);
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

  const sortValue = (p: Person, key: SortKey): string | number => {
    switch (key) {
      case 'name':
        return p.name.toLowerCase();
      case 'title':
        return p.title?.toLowerCase() || '~';
      case 'department':
        return p.department?.name.toLowerCase() ?? '~';
      case 'capacity':
        return Number(p.weeklyCapacityHours);
      case 'load':
        return loadOf(p.id);
      case 'openTasks':
        return openTasksOf(p.id);
      case 'projects':
        return p.projects.length;
    }
  };

  const q = search.trim().toLowerCase();
  const rows = shownPeople
    .filter(
      (p) =>
        !q ||
        [
          p.name,
          p.title ?? '',
          p.department?.name ?? '',
          ROLE_LABEL[p.role],
          ...p.projects.flatMap((pr) => [pr.code, pr.name]),
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      // Ties fall back to name so the order is stable.
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir || a.name.localeCompare(b.name);
    });
  const paged = usePagination(rows, 10, JSON.stringify([q, sort]));

  const tq = teamSearch.trim().toLowerCase();
  const shownTeams = teams.filter(
    (t) =>
      !tq ||
      [t.name, t.description ?? '', ...t.members.map((m) => m.person.name)]
        .join(' ')
        .toLowerCase()
        .includes(tq),
  );
  // Only teams currently shown count as selected, so a search never hides what gets deleted.
  const selectedTeams = shownTeams.filter((t) => selectedTeamIds.has(t.id));
  const toggleTeam = (id: string, on: boolean) =>
    setSelectedTeamIds((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  // The report covers every team, person and project, not just what the search shows.
  const reportData = () => ({ teams, people, projects });
  async function exportReport(kind: 'xlsx' | 'csv' | 'pptx') {
    setExporting(true);
    try {
      if (kind === 'csv') downloadText(teamsReportFileName('csv'), teamsReportCsv(reportData()));
      else if (kind === 'xlsx') await downloadTeamsXlsx(reportData());
      else await downloadTeamsPptx(reportData());
    } catch {
      showToast(
        `The ${kind === 'pptx' ? 'PowerPoint' : kind === 'xlsx' ? 'Excel' : 'CSV'} report couldn’t be created. Try again.`,
      );
    } finally {
      setExporting(false);
    }
  }
  function deleteSelectedTeams() {
    const names = selectedTeams.map((t) => t.name);
    const preview =
      names.length > 8
        ? `${names.slice(0, 8).join(', ')} and ${names.length - 8} more`
        : names.join(', ');
    if (
      window.confirm(
        `Delete ${names.length} ${names.length === 1 ? 'team' : 'teams'} (${preview})? The people stay on the Team page.`,
      )
    ) {
      removeTeams.mutate(selectedTeams.map((t) => t.id));
    }
  }

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
        {!member && (teams.length > 0 || people.length > 0) && (
          // Far right; after the subtitle when there is one (its ml-auto pushes both right).
          <div className={editable ? 'ml-auto' : 'order-last'}>
            <DownloadMenu
              label="Download report"
              title="Teams, members and their projects"
              busy={exporting}
              onSelect={exportReport}
              options={[
                { key: 'xlsx', label: 'Excel (.xlsx)', hint: 'By team and By project sheets' },
                { key: 'csv', label: 'CSV (.csv)', hint: 'By team table' },
                { key: 'pptx', label: 'PowerPoint (.pptx)', hint: 'Projects and all team members' },
              ]}
            />
          </div>
        )}
      </PageHeader>

      <section className="mb-4 min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <h2 className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-sm font-semibold">
          People
          <span className="flex items-center gap-3 text-xs font-normal text-muted">
            this week’s load against capacity
            {!member && (
              <input
                type="search"
                className={searchControl}
                placeholder="Search people"
                aria-label="Search people"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th
                    key={key}
                    className={`${th} cursor-pointer select-none`}
                    aria-sort={
                      sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'
                    }
                    onClick={() =>
                      setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))
                    }
                  >
                    {label}
                    {sort.key === key && (sort.dir > 0 ? ' ▲' : ' ▼')}
                  </th>
                ))}
                {editable && <th className={th} aria-label="Actions" />}
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
              {!!people.length && !rows.length && (
                <tr>
                  <td colSpan={8} className="p-2.5 text-center text-xs text-muted">
                    No people match “{search.trim()}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} noun="people" />
      </section>

      <LeaveSection people={people} />

      <section className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <h2 className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-sm font-semibold">
          Teams
          <span className="flex items-center gap-3 text-xs font-normal text-muted">
            groups across projects
            {teams.length > 0 && (
              <input
                type="search"
                className={searchControl}
                placeholder="Search teams"
                aria-label="Search teams"
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
              />
            )}
            {editable && (
              <button className={buttonClass()} onClick={() => setEditingTeam('new')}>
                Add team
              </button>
            )}
          </span>
        </h2>
        {selectedTeams.length > 0 && (
          <div
            role="region"
            aria-label="Selected teams"
            className="flex flex-wrap items-center gap-3 border-b border-line bg-teal-soft px-4 py-2 text-[13px]"
          >
            <b className="tabular-nums">
              {selectedTeams.length} {selectedTeams.length === 1 ? 'team' : 'teams'} selected
            </b>
            {selectedTeams.length < shownTeams.length && (
              <button
                type="button"
                className="text-xs font-semibold text-teal hover:underline"
                onClick={() => setSelectedTeamIds(new Set(shownTeams.map((t) => t.id)))}
              >
                Select all {shownTeams.length}
              </button>
            )}
            <span className="flex-1" />
            <button
              type="button"
              className="text-xs font-medium text-muted hover:text-ink"
              onClick={() => setSelectedTeamIds(new Set())}
            >
              Clear selection
            </button>
            <button
              type="button"
              className={`${buttonClass()} border-red text-red hover:bg-red-soft`}
              disabled={removeTeams.isPending}
              onClick={deleteSelectedTeams}
            >
              {removeTeams.isPending ? 'Deleting…' : 'Delete selected'}
            </button>
          </div>
        )}
        <div className="grid gap-3 px-4 py-3 md:grid-cols-2 xl:grid-cols-4">
          {shownTeams.map((team) => (
            <article
              key={team.id}
              aria-label={team.name}
              className={`rounded-md border bg-panel2 p-3 ${
                selectedTeamIds.has(team.id) ? 'border-teal' : 'border-line'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <label className="flex items-center gap-2 font-semibold">
                  {editable && (
                    <input
                      type="checkbox"
                      aria-label={`Select team ${team.name}`}
                      checked={selectedTeamIds.has(team.id)}
                      onChange={(e) => toggleTeam(team.id, e.target.checked)}
                    />
                  )}
                  {team.name}
                </label>
                {editable && (
                  <button
                    className="text-xs text-teal hover:underline"
                    aria-label={`Edit team ${team.name}`}
                    onClick={() => setEditingTeam(team)}
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="mb-2 text-xs text-muted">{team.description}</div>
              <ul className="flex flex-col gap-1.5">
                {team.members.map((m) => (
                  <li key={m.person.id} className="flex items-center gap-2">
                    <Avatar name={m.person.name} allNames={personNames} size={22} />
                    {m.person.name}
                    {m.isLead && <span className="text-xs font-semibold text-teal">Lead</span>}
                  </li>
                ))}
                {!team.members.length && <li className="text-xs text-muted">No members yet</li>}
              </ul>
            </article>
          ))}
          {!teams.length && (
            <p className="text-xs text-muted">
              No teams yet.{editable && ' Use Add team to group people.'}
            </p>
          )}
          {!!teams.length && !shownTeams.length && (
            <p className="text-xs text-muted">No teams match “{teamSearch.trim()}”.</p>
          )}
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
      {editingTeam && (
        <TeamDialog
          team={editingTeam === 'new' ? null : editingTeam}
          people={people}
          onClose={() => setEditingTeam(null)}
        />
      )}
      <Toast message={toastMessage} />
    </>
  );
}
