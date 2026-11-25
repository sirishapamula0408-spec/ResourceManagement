import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, Navigate, Outlet, useParams } from 'react-router-dom';
import { setProjectContext } from '../../components/tasks/taskHelpers';
import { api, isSales, type Project } from '../../lib/api';
import { ProjectSidebar } from './ProjectSidebar';

/**
 * A project's own space, like a JIRA project: a header with Summary, Backlog, Board, List,
 * Sprints and Settings tabs, opened from the Projects page at /projects/<KEY>.
 */
export function ProjectLayout() {
  const { code = '' } = useParams();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });
  const project = projects.find((p) => p.code.toLowerCase() === code.toLowerCase());

  // New tasks created while here default to this project.
  useEffect(() => {
    setProjectContext(project?.id ?? null);
    return () => setProjectContext(null);
  }, [project?.id]);

  // Sales users have the project list only.
  if (isSales()) return <Navigate to="/projects" replace />;
  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;
  if (!project) {
    return (
      <p className="text-muted">
        Project {code.toUpperCase()} was not found, or you are not on it.{' '}
        <Link to="/projects" className="text-teal hover:underline">
          Back to projects
        </Link>
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <ProjectSidebar project={project} allCodes={projects.map((p) => p.code)} />
      <Outlet context={{ project }} />
    </div>
  );
}
