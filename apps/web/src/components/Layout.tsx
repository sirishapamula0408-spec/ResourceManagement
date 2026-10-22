import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { auth } from '../lib/api';

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/board', label: 'Board' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/projects', label: 'Projects' },
  { to: '/teams', label: 'Teams' },
];

export function Layout() {
  const navigate = useNavigate();
  const signedIn = Boolean(auth.getToken());

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6 text-lg font-semibold text-indigo-600">Resource Board</div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="mt-8 text-sm text-slate-500 hover:text-slate-800"
          onClick={() => {
            auth.clear();
            navigate('/login');
          }}
        >
          {signedIn ? 'Sign out' : 'Sign in'}
        </button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
