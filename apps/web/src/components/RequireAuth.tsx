import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '../lib/api';

/**
 * Every page needs a signed-in user; otherwise go to sign-in and come back afterwards. A token
 * that is still stored but no longer usable (expired, unreadable) means the session expired.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!auth.getUser()) {
    const next = encodeURIComponent(location.pathname + location.search);
    const reason = auth.getToken() ? 'reason=expired&' : '';
    return <Navigate to={`/login?${reason}next=${next}`} replace />;
  }
  return children;
}
