import { BoardPage } from '../BoardPage';
import { TasksPage } from '../TasksPage';
import { useProject } from './useProject';

/** The Board page, limited to the open project (starts on its active sprint). */
export function ProjectBoard() {
  return <BoardPage project={useProject()} />;
}

/** The Tasks page, limited to the open project. */
export function ProjectList() {
  return <TasksPage project={useProject()} />;
}
