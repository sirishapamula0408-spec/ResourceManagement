import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { auth, canManage } from '../lib/api';
import { buttonClass } from '../lib/forms';
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

/** Three rising bars: the Resource Board mark from the prototype. */
function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="12" width="5" height="9" rx="1" fill="var(--color-amber)" />
      <rect x="8.5" y="6" width="5" height="15" rx="1" fill="var(--color-teal)" />
      <rect x="16" y="1" width="5" height="20" rx="1" fill="var(--color-ink)" />
    </svg>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const signedIn = Boolean(auth.getToken());
  const [creating, setCreating] = useState(false);
  const [toastMessage, showToast] = useToast();

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
        {canManage() && (
          <button className={buttonClass('primary')} onClick={() => setCreating(true)}>
            Create task
          </button>
        )}
        <button
          className="rounded-md border border-line bg-panel px-3 py-1.5 font-medium hover:bg-panel2"
          onClick={() => {
            auth.clear();
            navigate('/login');
          }}
        >
          {signedIn ? 'Sign out' : 'Sign in'}
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
