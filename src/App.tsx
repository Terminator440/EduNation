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
import HomeroomDashboard from "./pages/HomeroomDashboard";
import ParentDashboard from "./pages/ParentDashboard";
import Grades from "./pages/Grades";
import Attendance from "./pages/Attendance";
import SchoolCalendar from "./pages/SchoolCalendar";
import Lessons from "./pages/Lessons";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/dashboard" element={
              <ProtectedRoute allowedRoles={['student']}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/parent" element={
              <ProtectedRoute allowedRoles={['parent']}>
                <ParentDashboard />
              </ProtectedRoute>
            } />
            <Route path="/teacher" element={
              <ProtectedRoute allowedRoles={['teacher', 'homeroom_teacher', 'director', 'secretariat']}>
                <TeacherDashboard />
              </ProtectedRoute>
            } />
            <Route path="/homeroom" element={
              <ProtectedRoute allowedRoles={['homeroom_teacher', 'director', 'secretariat']}>
                <HomeroomDashboard />
              </ProtectedRoute>
            } />
            <Route path="/secretariat" element={
              <ProtectedRoute allowedRoles={['secretariat', 'director']}>
                <SecretariatDashboard />
              </ProtectedRoute>
            } />
            <Route path="/director" element={
              <ProtectedRoute allowedRoles={['director']}>
                <DirectorDashboard />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/grades" element={
              <ProtectedRoute>
                <Grades />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/attendance" element={
              <ProtectedRoute>
                <Attendance />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/calendar" element={
              <ProtectedRoute>
                <SchoolCalendar />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/lessons" element={
              <ProtectedRoute>
                <Lessons />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
