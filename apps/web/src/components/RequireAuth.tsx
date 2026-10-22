import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '../lib/api';

/** Every page needs a signed-in user; otherwise go to sign-in and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!auth.getUser()) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}
