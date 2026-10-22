import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { api, type Task } from '../lib/api';

/** TODO(M1): filters, sorting, inline edit, pagination. */
export function TasksPage() {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });

  return (
    <>
      <PageHeader title="Tasks" subtitle="List view of all tasks." />
      {isLoading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Project</th>
              <th className="p-3">Title</th>
              <th className="p-3">Status</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Assignee</th>
              <th className="p-3 text-right">Est. (h)</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="p-3 text-slate-500">{t.project.code}</td>
                <td className="p-3">{t.title}</td>
                <td className="p-3">{t.status}</td>
                <td className="p-3">{t.priority}</td>
                <td className="p-3">{t.assignee?.name ?? '-'}</td>
                <td className="p-3 text-right">{t.estimateHours ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
