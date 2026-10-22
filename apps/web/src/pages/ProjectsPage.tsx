import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { api, type Project } from '../lib/api';

/** TODO(M1): create/edit projects, allocations grid. */
export function ProjectsPage() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });

  return (
    <>
      <PageHeader title="Projects" />
      {isLoading && <p className="text-slate-500">Loading...</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-400">{p.code}</div>
            <div className="font-medium">{p.name}</div>
            <div className="mt-2 text-sm text-slate-500">
              {p.status} - owner {p.owner?.name ?? 'n/a'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {p._count.tasks} tasks, {p._count.allocations} allocations
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
