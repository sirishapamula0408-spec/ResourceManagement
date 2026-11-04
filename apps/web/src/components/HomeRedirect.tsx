import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { api, isSales, isTeamMember, type Project } from '../lib/api';

/**
 * The first page after sign-in: the pipeline for sales users and the dashboard for managers.
 * A team member's own tasks live in their project's List, so one on a single project lands
 * there; one on several picks a project from the list.
 */
export function HomeRedirect() {
  const member = isTeamMember();
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
    enabled: member,
  });
  if (isSales()) return <Navigate to="/leads" replace />;
  if (!member) return <Navigate to="/dashboard" replace />;
  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;
  const only = projects?.length === 1 ? projects[0] : undefined;
  return <Navigate to={only ? `/projects/${only.code}/list` : '/projects'} replace />;
}
