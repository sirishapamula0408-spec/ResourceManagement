import { createBrowserRouter } from 'react-router-dom';
import { HomeRedirect } from './components/HomeRedirect';
import { Layout } from './components/Layout';
import { LegacyTaskRedirect } from './components/LegacyTaskRedirect';
import { LeadsPage } from './pages/LeadsPage';
import { RequireAuth } from './components/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { SecurityPage } from './pages/SecurityPage';
import { ConnectPage } from './pages/ConnectPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { MfaVerifyPage } from './pages/MfaVerifyPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectBacklog } from './pages/project/ProjectBacklog';
import { ProjectLayout } from './pages/project/ProjectLayout';
import { ProjectBoard, ProjectList, ProjectSprints } from './pages/project/ProjectViews';
import { ProjectSettings } from './pages/project/ProjectSettings';
import { ProjectSummary } from './pages/project/ProjectSummary';
import { ReportsPage } from './pages/ReportsPage';
import { AuditPage } from './pages/AuditPage';
import { SignupPage } from './pages/SignupPage';
import { TaskPage } from './pages/TaskPage';
import { TeamsPage } from './pages/TeamsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/login/mfa', element: <MfaVerifyPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
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
    path: '/account/security',
    element: (
      <RequireAuth>
        <SecurityPage />
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
      // The old top-level pages, kept so bookmarks land in the matching project view.
      { path: 'board', element: <LegacyTaskRedirect view="board" /> },
      { path: 'tasks', element: <LegacyTaskRedirect view="list" /> },
      { path: 'sprints', element: <LegacyTaskRedirect view="sprints" /> },
      { path: 'browse/:key', element: <TaskPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      {
        path: 'projects/:code',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <ProjectSummary /> },
          { path: 'backlog', element: <ProjectBacklog /> },
          { path: 'board', element: <ProjectBoard /> },
          { path: 'list', element: <ProjectList /> },
          { path: 'sprints', element: <ProjectSprints /> },
          { path: 'settings', element: <ProjectSettings /> },
        ],
      },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: '*', element: <p className="text-muted">Page not found.</p> },
    ],
  },
]);
