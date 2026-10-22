import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
  useToast,
} from '../components/tasks/taskHelpers';
import { PageHeader } from '../components/PageHeader';
import { api, TASK_STATUSES, type Task } from '../lib/api';
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

/** Sortable list of every task; click a row to open it. */
export function TasksPage() {
  const [filter, setFilter] = useTaskFilter();
  const [open, setOpen] = useState<Task | null>(null);
  const [toastMessage, showToast] = useToast();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 });
  const { people, projects } = useTaskLookups();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });

  const rows = applyTaskFilter(tasks, filter).sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
  });

  const th =
    'cursor-pointer select-none border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-middle';

  return (
    <>
      <PageHeader title="Tasks">
        <TaskFilters filter={filter} onChange={setFilter} people={people} projects={projects} />
      </PageHeader>
      <section className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
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
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-2.5 text-center text-xs text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer hover:[&>td]:bg-panel2"
                  onClick={() => setOpen(t)}
                >
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
                </tr>
              ))}
              {!isLoading && !rows.length && (
                <tr>
                  <td colSpan={8} className="p-2.5 text-center text-xs text-muted">
                    No tasks match. Clear the filters to see everything.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {open && <TaskDialog task={open} onClose={() => setOpen(null)} onSaved={showToast} />}
      <Toast message={toastMessage} />
    </>
  );
}
