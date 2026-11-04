import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, Navigate, NavLink, Outlet, useParams } from 'react-router-dom';
import { setProjectContext } from '../../components/tasks/taskHelpers';
import { api, isSales, type Project } from '../../lib/api';
import { identityColor } from '../../lib/theme';

const VIEWS = [
  { to: '', label: 'Summary', end: true },
  { to: 'backlog', label: 'Backlog' },
  { to: 'board', label: 'Board' },
  { to: 'list', label: 'List' },
  { to: 'settings', label: 'Settings' },
];

/**
 * A project's own space, like a JIRA project: a sidebar with Summary, Backlog, Board, List and
 * Settings, opened from the Projects page at /projects/<KEY>.
 */
export function ProjectLayout() {
  const { code = '' } = useParams();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects.find((p) => p.code.toLowerCase() === code.toLowerCase());

  // New tasks created while here default to this project.
  useEffect(() => {
    setProjectContext(project?.id ?? null);
    return () => setProjectContext(null);
  }, [project?.id]);

  // Sales users have the project list only.
  if (isSales()) return <Navigate to="/projects" replace />;
  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;
  if (!project) {
    return (
      <p className="text-muted">
        Project {code.toUpperCase()} was not found, or you are not on it.{' '}
        <Link to="/projects" className="text-teal hover:underline">
          Back to projects
        </Link>
      </p>
    );
  }

  const color = identityColor(
    project.code,
    projects.map((p) => p.code),
  );
  return (
    <div className="grid gap-5 md:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="md:sticky md:top-5 md:self-start">
        <div className="mb-4 flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-bold text-white"
            style={{ background: color }}
            aria-hidden
          >
            {project.code.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold" title={project.name}>
              {project.name}
            </p>
            <p className="text-xs text-muted">{project.code} · Project</p>
          </div>
        </div>
        <nav aria-label="Project views" className="flex gap-1 overflow-x-auto md:flex-col">
          {VIEWS.map((v) => (
            <NavLink
              key={v.label}
              to={v.to}
              end={v.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-soft font-semibold text-teal'
                    : 'text-muted hover:bg-panel2 hover:text-ink'
                }`
              }
            >
              {v.label}
            </NavLink>
          ))}
        </nav>
        <Link
          to="/projects"
          className="mt-4 hidden text-xs text-muted hover:text-ink hover:underline md:block"
        >
          ← All projects
        </Link>
      </aside>
      <div className="min-w-0">
        <p className="mb-1 text-xs text-muted">
          <Link to="/projects" className="hover:underline">
            Projects
          </Link>{' '}
          / {project.name}
        </p>
        <Outlet context={{ project }} />
      </div>
    </div>
  );
}
