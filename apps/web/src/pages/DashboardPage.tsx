import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DemandBars } from '../components/dashboard/DemandBars';
import { DepartmentDonut } from '../components/dashboard/DepartmentDonut';
import { KpiStrip } from '../components/dashboard/KpiStrip';
import { UtilizationHeat } from '../components/dashboard/UtilizationHeat';
import { shortDate } from '../lib/theme';
import { PageHeader } from '../components/PageHeader';
import {
  api,
  isTeamMember,
  type DashboardOverview,
  type Department,
  type Project,
} from '../lib/api';

/** How far the Earlier / Later buttons move the 8-week window. */
const SHIFT_WEEKS = 4;

const shiftWeeks = (iso: string, weeks: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + weeks * 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

const control = 'rounded-md border border-line bg-panel px-2.5 py-1.5';
const segment = 'px-3 py-1.5 font-medium hover:bg-panel2 disabled:text-muted disabled:opacity-60';

export function DashboardPage() {
  const [projectId, setProjectId] = useState('');
  // undefined = the API's default window (two weeks back, six forward)
  const [from, setFrom] = useState<string>();

  const { data, isLoading, error, isPlaceholderData } = useQuery({
    queryKey: ['dashboard', 'overview', { projectId, from }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (from) params.set('from', from);
      const qs = params.toString();
      return api<DashboardOverview>(`/dashboard/overview${qs ? `?${qs}` : ''}`);
    },
    // Keep the previous render while a filter change loads, instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api<Department[]>('/people/departments'),
  });

  if (isLoading) return <p className="p-2.5 text-center text-xs text-muted">Loading…</p>;
  if (error) return <p className="text-red">Failed to load dashboard: {error.message}</p>;
  if (!data) return null;

  const { window } = data;
  const weeks = data.demandVsAvailability.map((w) => w.weekStart);
  const { unscheduledTasks } = data.kpis;

  return (
    <>
      <PageHeader
        title="Utilization"
        subtitle={`${isTeamMember() ? 'Your own workload · ' : ''}${shortDate(window.from)} – ${shortDate(window.to)} · ${window.weeks} weeks`}
      >
        <select
          className={control}
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
        <div className="flex overflow-hidden rounded-md border border-line bg-panel">
          <button
            className={segment}
            onClick={() => setFrom(shiftWeeks(window.from, -SHIFT_WEEKS))}
          >
            ← Earlier
          </button>
          <button
            className={`${segment} border-x border-line`}
            disabled={from === undefined}
            onClick={() => setFrom(undefined)}
          >
            This week
          </button>
          <button className={segment} onClick={() => setFrom(shiftWeeks(window.from, SHIFT_WEEKS))}>
            Later →
          </button>
        </div>
      </PageHeader>

      <div className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
        {unscheduledTasks > 0 && (
          <div className="mb-4 rounded-md border border-amber bg-amber-soft px-3.5 py-2.5">
            {unscheduledTasks} open {unscheduledTasks === 1 ? 'task is' : 'tasks are'} missing a
            start date, due date or estimate, so {unscheduledTasks === 1 ? 'it is' : 'they are'} not
            counted in demand.
          </div>
        )}
        <KpiStrip kpis={data.kpis} />
        <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <DemandBars weeks={data.demandVsAvailability} />
          <DepartmentDonut
            departments={data.departments}
            allDepartments={departments.map((d) => d.name)}
            weeks={window.weeks}
          />
        </div>
        <UtilizationHeat heatmap={data.heatmap} weeks={weeks} currentWeek={window.currentWeek} />
      </div>
    </>
  );
}
