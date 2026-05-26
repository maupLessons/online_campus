import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import { Role } from './types';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuthStore } from './store/authStore';

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

function RouteLoader() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoader />}>{children}</Suspense>;
}

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <BrowserRouter>
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
              <ProtectedRoute allowedRoles={[Role.STUDENT]}>
                <LazyPage>
                  <SurveysPage />
                </LazyPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="surveys/:id"
            element={
              <ProtectedRoute allowedRoles={[Role.STUDENT]}>
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
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
