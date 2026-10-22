import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '../components/PageHeader';
import { api, TASK_STATUSES, type DashboardSummary } from '../lib/api';

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
  });

  if (isLoading) return <p className="text-slate-500">Loading dashboard...</p>;
  if (error) return <p className="text-red-600">Failed to load dashboard: {error.message}</p>;
  if (!data) return null;

  const chartData = TASK_STATUSES.map((s) => ({ status: s, count: data.tasksByStatus[s] ?? 0 }));

  return (
    <>
      <PageHeader title="Utilization dashboard" subtitle={`Week of ${data.weekStart}`} />
      {/* TODO(M1): six KPIs, demand vs availability, department donut, person x week heat map */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi label="People" value={data.people} />
        <Kpi label="Active projects" value={data.activeProjects} />
        <Kpi label="Open tasks" value={data.openTasks} />
        <Kpi label="Capacity (h)" value={data.capacityHours} />
        <Kpi label="Allocated (h)" value={data.allocatedHours} />
        <Kpi label="Utilization" value={`${data.utilizationPct}%`} />
      </div>
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-600">Tasks by status</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="status" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  );
}
