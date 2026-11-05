import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { api, isSales, isTeamMember, isViewer, type Project } from '../lib/api';

/**
 * The first page after sign-in: the pipeline for sales users and the dashboard for managers.
 * A team member's own tasks live in their project's List, so one on a single project lands
 * there; a viewer on a single project lands on its Board, the overview of where work stands.
 * Either on several projects picks one from the list.
 */
export function HomeRedirect() {
  const viewer = isViewer();
  const scoped = isTeamMember() || viewer;
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
    enabled: scoped,
  });
  if (isSales()) return <Navigate to="/leads" replace />;
  if (!scoped) return <Navigate to="/dashboard" replace />;
  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;
  const only = projects?.length === 1 ? projects[0] : undefined;
  if (!only) return <Navigate to="/projects" replace />;
  return <Navigate to={`/projects/${only.code}/${viewer ? 'board' : 'list'}`} replace />;
}
