import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, auth, canCreateTasks, ROLE_LABEL, type Role } from '../lib/api';
import { buttonClass } from '../lib/forms';
import { BrandMark } from './AuthCard';
import { useToast } from './tasks/taskHelpers';
import { TaskDialog } from './tasks/TaskDialog';
import { Toast } from './tasks/taskUi';

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/board', label: 'Board' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/projects', label: 'Projects' },
  { to: '/teams', label: 'Team' },
];

/** App shell; only rendered for signed-in users (see RequireAuth in the router). */
export function Layout() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [toastMessage, showToast] = useToast();
  // Name and current role come from the API, so a role change shows without signing in again.
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ name: string; email: string; role: Role }>('/auth/me'),
  });
  const role = me?.role ?? auth.getUser()?.role;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-5 border-b border-line bg-panel px-5">
        <div className="flex items-center gap-2.5 text-base font-bold tracking-tight">
          <BrandMark />
          Resource Board
        </div>
        <nav className="flex gap-0.5 self-stretch" aria-label="Views">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center border-b-[3px] px-3.5 font-medium ${isActive ? 'border-teal text-ink' : 'border-transparent text-muted hover:text-ink'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        {canCreateTasks() && (
          <button className={buttonClass('primary')} onClick={() => setCreating(true)}>
            Create task
          </button>
        )}
        <Link
          to="/account/password"
          className="text-right text-xs leading-tight text-muted hover:text-ink"
          title="Change password"
        >
          <span className="block font-semibold text-ink">{me?.name ?? auth.getUser()?.email}</span>
          {role && ROLE_LABEL[role]}
        </Link>
        <button
          className="rounded-md border border-line bg-panel px-3 py-1.5 font-medium hover:bg-panel2"
          onClick={() => {
            auth.clear();
            navigate('/login');
          }}
        >
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-[1440px] p-5">
        <Outlet />
      </main>
      {creating && (
        <TaskDialog task={null} onClose={() => setCreating(false)} onSaved={showToast} />
      )}
      <Toast message={toastMessage} />
    </div>
  );
}
