import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pagination } from '../components/Pagination';
import { RowActions } from '../components/RowActions';
import { TaskDialog } from '../components/tasks/TaskDialog';
import { PriorityBadge, StatusPill, TaskFilters, Toast } from '../components/tasks/taskUi';
import {
  applyTaskFilter,
  dueLabel,
  hours,
  isOverdue,
  PRIORITY_RANK,
  useTaskFilter,
  useTaskLookups,
  useTaskPermissions,
  useToast,
} from '../components/tasks/taskHelpers';
import { PageHeader } from '../components/PageHeader';
import { api, auth, isTeamMember, TASK_STATUSES, type Task } from '../lib/api';
import { buttonClass, errorMessage } from '../lib/forms';
import { usePagination } from '../lib/pagination';
import { fmt } from '../lib/theme';

type SortKey = 'key' | 'title' | 'status' | 'assignee' | 'project' | 'priority' | 'est' | 'due';

const COLUMNS: [SortKey, string][] = [
  ['key', 'Key'],
  ['title', 'Summary'],
  ['status', 'Status'],
  ['assignee', 'Assignee'],
  ['project', 'Project'],
  ['priority', 'Priority'],
  ['est', 'Est / logged'],
  ['due', 'Due'],
];

const sortValue = (t: Task, key: SortKey): string | number => {
  switch (key) {
    case 'key':
      return Number(t.key.split('-')[1]) || 0;
    case 'title':
      return t.title.toLowerCase();
    case 'status':
      return TASK_STATUSES.indexOf(t.status);
    case 'assignee':
      return t.assignee?.name ?? '~'; // unassigned last
    case 'project':
      return t.project.name;
    case 'priority':
      return PRIORITY_RANK[t.priority];
    case 'est':
      return hours(t.estimateHours);
    case 'due':
      return t.dueDate ?? '9999';
  }
};

const TASK_QUERIES = [['tasks'], ['dashboard'], ['projects']];

/** Header checkbox that shows "some selected" as a dash. */
function SelectAll({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

/** Sortable, paged list of every task; click a row to open it, tick rows to delete several. */
export function TasksPage() {
  const [filter, setFilter] = useTaskFilter();
  const [open, setOpen] = useState<Task | null>(null);
  const [toastMessage, showToast] = useToast();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { people, projects } = useTaskLookups();
  const { canManageProject, canWork, manageableProjects } = useTaskPermissions();
  const qc = useQueryClient();
  const refresh = () => TASK_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));

  const remove = useMutation({
    mutationFn: (t: Task) => api(`/tasks/${t.id}`, { method: 'DELETE' }),
    onSuccess: (_r, t) => {
      refresh();
      setSelected((s) => {
        const next = new Set(s);
        next.delete(t.id);
        return next;
      });
      showToast(`${t.key} deleted`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });
  const removeMany = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ deleted: number }>('/tasks/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: ({ deleted }) => {
      refresh();
      setSelected(new Set());
      showToast(`Deleted ${deleted} ${deleted === 1 ? 'task' : 'tasks'}`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });

  // A team member's Tasks page lists only the tasks assigned to them.
  const member = isTeamMember();
  const myId = auth.getUser()?.id;
  const visible = member ? tasks.filter((t) => t.assignee?.id === myId) : tasks;
  const rows = applyTaskFilter(visible, member ? { ...filter, assigneeId: '' } : filter).sort(
    (a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    },
  );

  // Changing filters or sorting returns to page 1 and clears the selection, so a delete
  // never includes tasks that are no longer on screen.
  const viewKey = JSON.stringify([filter, sort]);
  const [selectionKey, setSelectionKey] = useState(viewKey);
  if (selectionKey !== viewKey) {
    setSelectionKey(viewKey);
    setSelected(new Set());
  }
  const paged = usePagination(rows, 25, viewKey);

  const canDelete = (t: Task) => canManageProject(t.project.id);
  const selecting = manageableProjects.length > 0; // admins and PMs on at least one project
  const deletableOnPage = paged.items.filter(canDelete);
  const deletableAll = rows.filter(canDelete);
  const selectedTasks = rows.filter((t) => selected.has(t.id));
  const allOnPageSelected =
    deletableOnPage.length > 0 && deletableOnPage.every((t) => selected.has(t.id));
  const someOnPageSelected = deletableOnPage.some((t) => selected.has(t.id));

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const togglePage = (on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      deletableOnPage.forEach((t) => (on ? next.add(t.id) : next.delete(t.id)));
      return next;
    });

  function deleteSelected() {
    const keys = selectedTasks.map((t) => t.key);
    const preview =
      keys.length > 8
        ? `${keys.slice(0, 8).join(', ')} and ${keys.length - 8} more`
        : keys.join(', ');
    if (
      window.confirm(
        `Delete ${keys.length} ${keys.length === 1 ? 'task' : 'tasks'} (${preview})? This can’t be undone.`,
      )
    ) {
      removeMany.mutate(selectedTasks.map((t) => t.id));
    }
  }

  const columnCount = COLUMNS.length + (selecting ? 2 : 1);
  const th =
    'cursor-pointer select-none border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-middle';

  return (
    <>
      <PageHeader title="Tasks" subtitle={member ? 'Tasks assigned to you' : undefined}>
        <TaskFilters
          filter={filter}
          onChange={setFilter}
          people={people}
          projects={projects}
          showAssignee={!member}
        />
      </PageHeader>
      <section className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        {selectedTasks.length > 0 && (
          <div
            role="region"
            aria-label="Selected tasks"
            className="flex flex-wrap items-center gap-3 border-b border-line bg-teal-soft px-3 py-2"
          >
            <b className="tabular-nums">
              {selectedTasks.length} {selectedTasks.length === 1 ? 'task' : 'tasks'} selected
            </b>
            {selectedTasks.length < deletableAll.length && (
              <button
                type="button"
                className="text-xs font-semibold text-teal hover:underline"
                onClick={() => setSelected(new Set(deletableAll.map((t) => t.id)))}
              >
                Select all {deletableAll.length} you can delete
              </button>
            )}
            <span className="flex-1" />
            <button
              type="button"
              className="text-xs font-medium text-muted hover:text-ink"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
            <button
              type="button"
              className={`${buttonClass()} border-red text-red hover:bg-red-soft`}
              disabled={removeMany.isPending}
              onClick={deleteSelected}
            >
              {removeMany.isPending ? 'Deleting…' : 'Delete selected'}
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {selecting && (
                  <th className="w-9 border-b border-line px-2.5 py-2">
                    <SelectAll
                      label="Select all tasks you can delete on this page"
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected && !allOnPageSelected}
                      onChange={togglePage}
                    />
                  </th>
                )}
                {COLUMNS.map(([key, label]) => (
                  <th
                    key={key}
                    className={th}
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
                <th className="border-b border-line" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={columnCount} className="p-2.5 text-center text-xs text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {paged.items.map((t) => (
                <tr
                  key={t.id}
                  className={`cursor-pointer hover:[&>td]:bg-panel2 ${selected.has(t.id) ? '[&>td]:bg-teal-soft/40' : ''}`}
                  onClick={() => setOpen(t)}
                >
                  {selecting && (
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      {canDelete(t) && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${t.key}`}
                          checked={selected.has(t.id)}
                          onChange={(e) => toggle(t.id, e.target.checked)}
                        />
                      )}
                    </td>
                  )}
                  <td className={`${td} text-xs font-semibold text-muted`}>{t.key}</td>
                  <td className={td}>{t.title}</td>
                  <td className={td}>
                    <StatusPill status={t.status} />
                  </td>
                  <td className={td}>
                    {t.assignee?.name ?? <span className="text-muted">Unassigned</span>}
                  </td>
                  <td className={td}>{t.project.name}</td>
                  <td className={td}>
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {fmt(hours(t.estimateHours))} / {fmt(t.loggedHours)}h
                  </td>
                  <td
                    className={`${td} whitespace-nowrap ${isOverdue(t) ? 'font-semibold text-red' : ''}`}
                  >
                    {t.dueDate ? dueLabel(t.dueDate) : ''}
                  </td>
                  <td className={td}>
                    <RowActions
                      onEdit={() => setOpen(t)}
                      editLabel={canWork(t) ? 'Edit' : 'View'}
                      onDelete={canDelete(t) ? () => remove.mutate(t) : undefined}
                      deleteConfirm={`Delete ${t.key} “${t.title}”? This can’t be undone.`}
                      busy={remove.isPending}
                    />
                  </td>
                </tr>
              ))}
              {!isLoading && !rows.length && (
                <tr>
                  <td colSpan={columnCount} className="p-2.5 text-center text-xs text-muted">
                    No tasks match. Clear the filters to see everything.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} noun="tasks" />
      </section>
      {open && <TaskDialog task={open} onClose={() => setOpen(null)} onSaved={showToast} />}
      <Toast message={toastMessage} />
    </>
  );
}
