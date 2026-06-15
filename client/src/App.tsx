import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import LoginPage from './pages/auth/LoginPage';
import { Role } from './types';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuthStore } from './store/authStore';
import { AUTH_SESSION_EXPIRED_EVENT } from './services/api';

const ALL_ROLES = Object.values(Role) as Role[];

const DashboardPage = lazy(() => import('./pages/shared/DashboardPage'));
const SchedulePage = lazy(() => import('./pages/shared/SchedulePage'));
const CoursesPage = lazy(() => import('./pages/course/CoursesPage'));
const CourseDetailPage = lazy(() => import('./pages/course/CourseDetailPage'));
const AssignmentsPage = lazy(() => import('./pages/student/AssignmentsPage'));
const GradesPage = lazy(() => import('./pages/student/GradesPage'));
const NotificationsPage = lazy(
  () => import('./pages/shared/NotificationsPage'),
);
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const ReportsPage = lazy(() => import('./pages/shared/ReportsPage'));
const ReferencesPage = lazy(() => import('./pages/shared/ReferencesPage'));
const ProfilePage = lazy(() => import('./pages/shared/ProfilePage'));
const SurveysPage = lazy(() => import('./pages/surveys/SurveysPage'));
const SurveyPlayerPage = lazy(
  () => import('./pages/surveys/SurveyPlayerPage'),
);
const SurveyAdminPage = lazy(
  () => import('./pages/surveys/SurveyAdminPage'),
);
const SurveyResultsPage = lazy(
  () => import('./pages/surveys/SurveyResultsPage'),
);
const ElectivesPage = lazy(() => import('./pages/electives/ElectivesPage'));
const ElectiveAdminPage = lazy(
  () => import('./pages/electives/ElectiveAdminPage'),
);

function RouteLoader() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary compact>
      <Suspense fallback={<RouteLoader />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const expireSession = useAuthStore((state) => state.expireSession);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);

    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
    };
  }, [expireSession]);

  return (
    <BrowserRouter>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ForgotPasswordPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <LazyPage>
                  <DashboardPage />
                </LazyPage>
              }
            />
          <Route
            path="schedule"
            element={
              <LazyPage>
                <SchedulePage />
              </LazyPage>
            }
          />
          <Route
            path="courses"
            element={
              <LazyPage>
                <CoursesPage />
              </LazyPage>
            }
          />
          <Route
            path="courses/:id"
            element={
              <LazyPage>
                <CourseDetailPage />
              </LazyPage>
            }
          />
          <Route
            path="assignments"
            element={
              <LazyPage>
                <AssignmentsPage />
              </LazyPage>
            }
          />
          <Route
            path="grades"
            element={
              <LazyPage>
                <GradesPage />
              </LazyPage>
            }
          />
          <Route
            path="surveys"
            element={
              <ProtectedRoute allowedRoles={[Role.STUDENT, Role.TEACHER]}>
                <LazyPage>
                  <SurveysPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="surveys/:id"
            element={
              <ProtectedRoute allowedRoles={[Role.STUDENT, Role.TEACHER]}>
                <LazyPage>
                  <SurveyPlayerPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="surveys/admin"
            element={
              <ProtectedRoute
                allowedRoles={[Role.ADMIN, Role.DEAN, Role.RECTOR]}>
                <LazyPage>
                  <SurveyAdminPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="surveys/admin/:id/results"
            element={
              <ProtectedRoute
                allowedRoles={[
                  Role.ADMIN,
                  Role.DEAN,
                  Role.RECTOR,
                  Role.PRESIDENT,
                ]}>
                <LazyPage>
                  <SurveyResultsPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="electives"
            element={
              <ProtectedRoute allowedRoles={[Role.STUDENT]}>
                <LazyPage>
                  <ElectivesPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="electives/admin"
            element={
              <ProtectedRoute
                allowedRoles={[
                  Role.ADMIN,
                  Role.DEPARTMENT_HEAD,
                  Role.DEAN,
                  Role.RECTOR,
                  Role.PRESIDENT,
                ]}>
                <LazyPage>
                  <ElectiveAdminPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="notifications"
            element={
              <LazyPage>
                <NotificationsPage />
              </LazyPage>
            }
          />
          <Route
            path="profile"
            element={
              <ProtectedRoute>
                <LazyPage>
                  <ProfilePage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="users"
            element={
              <ProtectedRoute
                allowedRoles={[
                  Role.ADMIN,
                  Role.PRESIDENT,
                  Role.RECTOR,
                  Role.DEAN,
                ]}>
                <LazyPage>
                  <UsersPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="audit-log"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN]}>
                <LazyPage>
                  <AuditLogPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="reports"
            element={
              <ProtectedRoute
                allowedRoles={[
                  Role.DEPARTMENT_HEAD,
                  Role.DEAN,
                  Role.RECTOR,
                  Role.PRESIDENT,
                  Role.ADMIN,
                ]}>
                <LazyPage>
                  <ReportsPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="references"
            element={
              <ProtectedRoute allowedRoles={ALL_ROLES}>
                <LazyPage>
                  <ReferencesPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
        </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </RouteErrorBoundary>
    </BrowserRouter>
  );
}
