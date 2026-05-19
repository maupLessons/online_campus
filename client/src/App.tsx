import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/shared/DashboardPage';
import SchedulePage from './pages/shared/SchedulePage';
import CoursesPage from './pages/course/CoursesPage';
import CourseDetailPage from './pages/course/CourseDetailPage';
import AssignmentsPage from './pages/student/AssignmentsPage';
import GradesPage from './pages/student/GradesPage';
import NotificationsPage from './pages/shared/NotificationsPage';
import UsersPage from './pages/admin/UsersPage';
import { Role } from './types';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/:id" element={<CourseDetailPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="grades" element={<GradesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route
            path="users"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN, Role.PRESIDENT, Role.RECTOR, Role.DEAN]}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
