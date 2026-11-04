import { Link, NavLink } from 'react-router-dom';
import type { Project } from '../../lib/api';
import { identityColor } from '../../lib/theme';

export type ProjectView = 'summary' | 'backlog' | 'board' | 'list' | 'settings';

const VIEWS: { view: ProjectView; path: string; label: string }[] = [
  { view: 'summary', path: '', label: 'Summary' },
  { view: 'backlog', path: '/backlog', label: 'Backlog' },
  { view: 'board', path: '/board', label: 'Board' },
  { view: 'list', path: '/list', label: 'List' },
  { view: 'settings', path: '/settings', label: 'Settings' },
];

/**
 * A project's sidebar, as in JIRA: its badge and name, then Summary, Backlog, Board, List and
 * Settings. Shown in the project space and beside a task page, so the project stays in reach.
 */
export function ProjectSidebar({
  project,
  allCodes,
  highlight,
}: {
  project: Project;
  /** Every project code, so the badge colour matches the rest of the app. */
  allCodes: string[];
  /** On a task page: the view the task was opened from, shown as current. */
  highlight?: ProjectView;
}) {
  const base = `/projects/${project.code}`;
  return (
    <aside className="md:sticky md:top-5 md:self-start">
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-bold text-white"
          style={{ background: identityColor(project.code, allCodes) }}
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
            key={v.view}
            to={base + v.path}
            end
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                isActive || highlight === v.view
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
  );
}
