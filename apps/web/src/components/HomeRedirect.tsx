import { Navigate } from 'react-router-dom';
import { isSales } from '../lib/api';

/** The first page after sign-in: the pipeline for sales users, the dashboard for everyone else. */
export function HomeRedirect() {
  return <Navigate to={isSales() ? '/leads' : '/dashboard'} replace />;
}
