import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import SecretariatDashboard from "./pages/SecretariatDashboard";
import DirectorDashboard from "./pages/DirectorDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import HomeroomDashboard from "./pages/HomeroomDashboard";
import ParentDashboard from "./pages/ParentDashboard";
import Grades from "./pages/Grades";
import Attendance from "./pages/Attendance";
import SchoolCalendar from "./pages/SchoolCalendar";
import Lessons from "./pages/Lessons";
import Schedule from "./pages/Schedule";
import Library from "./pages/resources/Library";
import Manuals from "./pages/resources/Manuals";
import Magazines from "./pages/resources/Magazines";
import Documents from "./pages/resources/Documents";
import TakeAttendance from "./pages/TakeAttendance";
import Reports from "./pages/Reports";
import AuditLogs from "./pages/AuditLogs";
import Announcements from "./pages/Announcements";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Auth />} />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={["student"]}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/parent"
                element={
                  <ProtectedRoute allowedRoles={["parent"]}>
                    <ParentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher"
                element={
                  <ProtectedRoute allowedRoles={["teacher", "homeroom_teacher", "director", "secretariat"]}>
                    <TeacherDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher/attendance"
                element={
                  <ProtectedRoute allowedRoles={["teacher", "homeroom_teacher"]}>
                    <TakeAttendance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/homeroom"
                element={
                  <ProtectedRoute allowedRoles={["homeroom_teacher", "director", "secretariat"]}>
                    <HomeroomDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute allowedRoles={["teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audit"
                element={
                  <ProtectedRoute allowedRoles={["secretariat", "director", "uat_admin"]}>
                    <AuditLogs />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/announcements"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Announcements />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Notifications />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/secretariat"
                element={
                  <ProtectedRoute allowedRoles={["secretariat", "director"]}>
                    <SecretariatDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/director"
                element={
                  <ProtectedRoute allowedRoles={["director"]}>
                    <DirectorDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={["uat_admin"]}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/dashboard/grades"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent"]}>
                    <Grades />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/attendance"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent"]}>
                    <Attendance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/calendar"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <SchoolCalendar />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/schedule"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Schedule />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/resources/library"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Library />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/resources/manuals"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Manuals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/resources/magazines"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Magazines />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/resources/documents"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Documents />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/lessons"
                element={
                  <ProtectedRoute allowedRoles={["student", "teacher", "homeroom_teacher", "secretariat", "director"]}>
                    <Lessons />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/settings"
                element={
                  <ProtectedRoute allowedRoles={["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]}>
                    <Settings />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
