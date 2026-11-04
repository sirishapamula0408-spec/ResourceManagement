import { createBrowserRouter } from 'react-router-dom';
import { HomeRedirect } from './components/HomeRedirect';
import { Layout } from './components/Layout';
import { LeadsPage } from './pages/LeadsPage';
import { RequireAuth } from './components/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ConnectPage } from './pages/ConnectPage';
import { BoardPage } from './pages/BoardPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SignupPage } from './pages/SignupPage';
import { SprintsPage } from './pages/SprintsPage';
import { TasksPage } from './pages/TasksPage';
import { TeamsPage } from './pages/TeamsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    path: '/connect',
    element: (
      <RequireAuth>
        <ConnectPage />
      </RequireAuth>
    ),
  },
  {
    path: '/account/password',
    element: (
      <RequireAuth>
        <ChangePasswordPage />
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'board', element: <BoardPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'sprints', element: <SprintsPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: '*', element: <p className="text-muted">Page not found.</p> },
    ],
  },
]);
