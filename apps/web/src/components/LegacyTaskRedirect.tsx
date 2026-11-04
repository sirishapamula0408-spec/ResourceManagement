import { useQuery } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api, type Project } from '../lib/api';

/**
 * The Board, Tasks and Sprints pages used to sit in the top bar; they now live inside each
 * project. An old link that names a project (?project=<id or key>) opens that project's matching
 * view with the rest of its filters; any other goes to the project list to pick one.
 */
export function LegacyTaskRedirect({ view }: { view: 'board' | 'list' | 'sprints' }) {
  const [params] = useSearchParams();
  const wanted = params.get('project');
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
    enabled: !!wanted,
  });
  if (!wanted) return <Navigate to="/projects" replace />;
  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;

  const project = projects?.find(
    (p) => p.id === wanted || p.code.toLowerCase() === wanted.toLowerCase(),
  );
  if (!project) return <Navigate to="/projects" replace />;
  // Inside a project the project is implied, so it leaves the address; sprints take no filters.
  // Work on a copy: deleting from the router's own params would drop the project on a re-render
  // and send the redirect to /projects instead.
  const rest = new URLSearchParams(params);
  rest.delete('project');
  const query = view === 'sprints' ? '' : rest.toString();
  return <Navigate to={`/projects/${project.code}/${view}${query ? `?${query}` : ''}`} replace />;
}
