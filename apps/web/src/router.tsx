import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { BoardPage } from './pages/BoardPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { TeamsPage } from './pages/TeamsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'board', element: <BoardPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: '*', element: <p className="text-muted">Page not found.</p> },
    ],
  },
]);
