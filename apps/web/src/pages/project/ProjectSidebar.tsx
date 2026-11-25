import { Link, NavLink } from 'react-router-dom';
import type { Project } from '../../lib/api';
import { identityColor } from '../../lib/theme';

export type ProjectView = 'summary' | 'backlog' | 'board' | 'list' | 'sprints' | 'settings';

const VIEWS: { view: ProjectView; path: string; label: string }[] = [
  { view: 'summary', path: '', label: 'Summary' },
  { view: 'backlog', path: '/backlog', label: 'Backlog' },
  { view: 'board', path: '/board', label: 'Board' },
  { view: 'list', path: '/list', label: 'List' },
  { view: 'sprints', path: '/sprints', label: 'Sprints' },
  { view: 'settings', path: '/settings', label: 'Settings' },
];

/**
 * A project's header, as in JIRA: its badge and name, then Summary, Backlog, Board, List,
 * Sprints and Settings as tabs across the page (the app's own sidebar is on the left, so the
 * project's views sit on top to leave the full width for the content). Shown in the project
 * space and above a task page, so the project stays in reach.
 */
export function ProjectSidebar({
  project,
  allCodes,
  highlight,
  breadcrumb = true,
}: {
  project: Project;
  /** Every project code, so the badge colour matches the rest of the app. */
  allCodes: string[];
  /** On a task page: the view the task was opened from, shown as current. */
  highlight?: ProjectView;
  /** "Projects / <name>" above the header; a task page shows its own. */
  breadcrumb?: boolean;
}) {
  const base = `/projects/${project.code}`;
  return (
    <div className="mb-5 border-b border-line">
      {breadcrumb && (
        <p className="mb-2 text-xs text-muted">
          <Link to="/projects" className="hover:underline">
            Projects
          </Link>{' '}
          / {project.name}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <Link to={base} className="mb-2 flex min-w-0 items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-bold text-white"
            style={{ background: identityColor(project.code, allCodes) }}
            aria-hidden
          >
            {project.code.slice(0, 2)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold" title={project.name}>
              {project.name}
            </span>
            <span className="block text-xs text-muted">{project.code} · Project</span>
          </span>
        </Link>
        <nav aria-label="Project views" className="-mb-px flex min-w-0 gap-1 overflow-x-auto">
          {VIEWS.map((v) => (
            <NavLink
              key={v.view}
              to={base + v.path}
              end
              className={({ isActive }) =>
                `border-b-2 px-3 pt-1.5 pb-2.5 text-sm whitespace-nowrap ${
                  isActive || highlight === v.view
                    ? 'border-teal font-semibold text-teal'
                    : 'border-transparent text-muted hover:border-line hover:text-ink'
                }`
              }
            >
              {v.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
