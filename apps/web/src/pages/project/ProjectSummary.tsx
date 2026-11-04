import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Avatar, EpicChip, StatusPill } from '../../components/tasks/taskUi';
import {
  dueLabel,
  hours,
  isOverdue,
  usePlanningLookups,
  useTaskLookups,
} from '../../components/tasks/taskHelpers';
import { api, TASK_STATUSES, type Task } from '../../lib/api';
import { fmt } from '../../lib/theme';
import { PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL } from '../../lib/statusStyles';
import { Progress } from '../SprintsPage';
import { useProject } from './useProject';

const card = 'rounded-lg border border-line bg-panel p-4 shadow-[0_1px_0_rgba(23,35,59,0.06)]';

const daysLeft = (end: string) => Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);

/** Project overview: headline numbers, work by status, the active sprint, epics and the team. */
export function ProjectSummary() {
  const project = useProject();
  const { personNames } = useTaskLookups();
  const { sprints, epics } = usePlanningLookups();
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });
  const tasks = allTasks.filter((t) => t.project.id === project.id);
  const open = tasks.filter((t) => t.status !== 'DONE');
  const overdue = tasks.filter(isOverdue);
  const estimate = tasks.reduce((s, t) => s + hours(t.estimateHours), 0);
  const logged = tasks.reduce((s, t) => s + t.loggedHours, 0);
  const active = sprints.find((s) => s.projectId === project.id && s.status === 'ACTIVE');
  const projectEpics = epics.filter((e) => e.projectId === project.id);
  const byStatus = TASK_STATUSES.map((s) => ({
    status: s,
    count: tasks.filter((t) => t.status === s).length,
  }));
  const most = Math.max(1, ...byStatus.map((s) => s.count));
  const dueSoon = open
    .filter((t) => t.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, 5);

  const tiles = [
    { label: 'Open tasks', value: open.length },
    { label: 'Done', value: tasks.length - open.length },
    { label: 'Overdue', value: overdue.length, warn: overdue.length > 0 },
    { label: 'Hours logged / estimated', value: `${fmt(logged)} / ${fmt(estimate)}h` },
  ];

  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;
  return (
    <>
      <PageHeader title="Summary">
        <span
          className={`rounded-[3px] px-[7px] py-0.5 text-[11px] font-semibold ${PROJECT_STATUS_CLASS[project.status]}`}
        >
          {PROJECT_STATUS_LABEL[project.status]}
        </span>
        {project.client && <span className="text-sm text-muted">for {project.client}</span>}
      </PageHeader>
      {project.description && <p className="mb-4 max-w-3xl text-muted">{project.description}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={card}>
            <p className="text-xs text-muted">{t.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${t.warn ? 'text-red' : ''}`}>
              {t.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="status-overview">
          <h2 id="status-overview" className="mb-3 font-semibold">
            Status overview
          </h2>
          <ul className="flex flex-col gap-2">
            {byStatus.map((s) => (
              <li key={s.status} className="grid grid-cols-[110px_1fr_32px] items-center gap-2">
                <StatusPill status={s.status} />
                <span className="h-2 overflow-hidden rounded-sm bg-line">
                  <i
                    className="block h-full bg-teal"
                    style={{ width: `${(100 * s.count) / most}%` }}
                  />
                </span>
                <span className="text-right text-sm tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={card} aria-labelledby="active-sprint">
          <h2 id="active-sprint" className="mb-3 font-semibold">
            Active sprint
          </h2>
          {active ? (
            <div className="flex flex-col gap-2">
              <p className="font-medium">{active.name}</p>
              {active.goal && <p className="text-sm text-muted">{active.goal}</p>}
              <p className="text-xs text-muted">
                {active.startDate && dueLabel(active.startDate)}
                {active.endDate &&
                  ` – ${dueLabel(active.endDate)} · ${Math.max(0, daysLeft(active.endDate))} days left`}
              </p>
              <Progress done={active.done} tasks={active.tasks} />
              <Link
                to={`/projects/${project.code}/board`}
                className="text-sm text-teal hover:underline"
              >
                Open the board
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No sprint is running.{' '}
              <Link to={`/projects/${project.code}/backlog`} className="text-teal hover:underline">
                Plan one in the backlog
              </Link>
              .
            </p>
          )}
        </section>

        <section className={card} aria-labelledby="due-soon">
          <h2 id="due-soon" className="mb-3 font-semibold">
            Due next
          </h2>
          {dueSoon.length ? (
            <ul className="divide-y divide-line">
              {dueSoon.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="text-xs font-semibold text-muted">{t.key}</span>
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className={isOverdue(t) ? 'font-semibold text-red' : 'text-muted'}>
                    {dueLabel(t.dueDate!)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No open tasks with a due date.</p>
          )}
        </section>

        <section className={card} aria-labelledby="epics">
          <h2 id="epics" className="mb-3 font-semibold">
            Epics
          </h2>
          {projectEpics.length ? (
            <ul className="flex flex-col gap-2">
              {projectEpics.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <EpicChip epic={e} />
                  <Progress done={e.done} tasks={e.tasks} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No epics yet. Add them in Settings.</p>
          )}
        </section>

        <section className={`${card} lg:col-span-2`} aria-labelledby="team">
          <h2 id="team" className="mb-3 font-semibold">
            Team
          </h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {project.owner && (
              <li className="flex items-center gap-2 text-sm">
                <Avatar name={project.owner.name} allNames={personNames} size={26} />
                {project.owner.name} <span className="text-xs text-muted">Owner</span>
              </li>
            )}
            {project.members
              .filter((m) => m.id !== project.owner?.id)
              .map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <Avatar name={m.name} allNames={personNames} size={26} />
                  {m.name}
                </li>
              ))}
            {!project.owner && !project.members.length && (
              <li className="text-sm text-muted">No one is on this project yet.</li>
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
