import { useOutletContext } from 'react-router-dom';
import type { Project } from '../../lib/api';

/** The project a project-space view is showing (set by ProjectLayout). */
export const useProject = () => useOutletContext<{ project: Project }>().project;
