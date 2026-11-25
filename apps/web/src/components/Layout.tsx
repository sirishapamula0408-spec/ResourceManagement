import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, auth, canCreateTasks, type Role } from '../lib/api';
import { buttonClass } from '../lib/forms';
import { AppSidebar } from './AppSidebar';
import { NotificationBell } from './NotificationBell';
import { SedHubMark } from './SignInShell';
import { useToast } from './tasks/taskHelpers';
import { TaskDialog } from './tasks/TaskDialog';
import { Toast } from './tasks/taskUi';

// Board, tasks and sprints are not here: they belong to a project, in its own space
// (/projects/<KEY>), as in JIRA.
const NAV = [
  { to: '/dashboard', label: 'Resource Dashboard' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/projects', label: 'Projects' },
  { to: '/teams', label: 'Team' },
  { to: '/reports', label: 'Reports' },
];
const LEADS = { to: '/leads', label: 'Leads' };

/** Pages a sales user may open; everything else sends them to Leads. */
const SALES_PAGES = ['/leads', '/projects'];

/** Team members and viewers work inside their projects only. */
const PROJECTS_ONLY: Role[] = ['MEMBER', 'VIEWER'];

/**
 * Pages a team member or viewer may open: the project list and project spaces, task pages, and
 * the old Board / Tasks / Sprints links (they redirect into a project). The home page picks
 * their project. Everything else (dashboard, team, reports, leads) sends them to Projects.
 */
const PROJECT_PAGES = ['/projects', '/browse/', '/board', '/tasks', '/sprints'];

function navFor(role: Role | undefined) {
  if (role === 'SALES') return [LEADS, { to: '/projects', label: 'Projects' }];
  if (role && PROJECTS_ONLY.includes(role)) return [{ to: '/projects', label: 'Projects' }];
  return role && ['ADMIN', 'DELIVERY_HEAD', 'PM'].includes(role) ? [...NAV, LEADS] : NAV;
}

/** App shell; only rendered for signed-in users (see RequireAuth in the router). */
export function Layout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toastMessage, showToast] = useToast();
  // Name and current role come from the API, so a role change shows without signing in again.
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ name: string; email: string; role: Role }>('/auth/me'),
  });
  const role = me?.role ?? auth.getUser()?.role;
  const location = useLocation();
  if (role === 'SALES' && !SALES_PAGES.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/leads" replace />;
  }
  if (
    role &&
    PROJECTS_ONLY.includes(role) &&
    location.pathname !== '/' &&
    !PROJECT_PAGES.some((p) => location.pathname.startsWith(p))
  ) {
    return <Navigate to="/projects" replace />;
  }

  const nav = navFor(role);
  const showPortfolio = nav.some((i) => i.to === '/portfolio');
  const signOut = () => {
    auth.clear();
    // Drop everything cached for this user so the next person never sees it.
    queryClient.clear();
    navigate('/login');
  };
  const pageTitle =
    [...nav, { to: '/audit', label: 'Audit log' }].find((i) => location.pathname.startsWith(i.to))
      ?.label ?? (location.pathname.startsWith('/browse/') ? 'Task' : '');
  const sidebar = (
    <AppSidebar
      nav={nav}
      role={role}
      name={me?.name ?? auth.getUser()?.email ?? ''}
      showPortfolio={showPortfolio}
      onSignOut={signOut}
      onNavigate={() => setMenuOpen(false)}
    />
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[264px_minmax(0,1fr)]">
      {/* Left navigation: fixed column on wide screens, a drawer on small ones. */}
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-panel2 md:block print:hidden">
        {sidebar}
      </aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-panel2 shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-line bg-panel px-5 print:hidden">
          <button
            type="button"
            className="-ml-1 rounded-md p-1.5 text-muted hover:bg-panel2 hover:text-ink md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="flex items-center gap-2 text-[15px] text-muted">
            <span className="md:hidden">
              <SedHubMark size={20} />
            </span>
            {pageTitle && <span className="text-ink">{pageTitle}</span>}
          </span>
          <div className="flex-1" />
          {canCreateTasks() && (
            <button className={buttonClass('primary')} onClick={() => setCreating(true)}>
              Create task
            </button>
          )}
          {/* Notifications are about tasks, which sales users don't work on. */}
          {role && role !== 'SALES' && <NotificationBell />}
        </header>
        <main className="mx-auto max-w-[1440px] p-5">
          <Outlet />
        </main>
      </div>
      {creating && (
        <TaskDialog task={null} onClose={() => setCreating(false)} onSaved={showToast} />
      )}
      <Toast message={toastMessage} />
    </div>
  );
}
