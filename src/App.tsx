import { lazy, Suspense } from "react";
import type { AppRole } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SchoolProvider } from "@/contexts/SchoolContext";
import { OfflineQueueProvider } from "@/contexts/OfflineQueueContext";
import { NavigationTransitionProvider } from "@/hooks/useNavigationTransition";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { OfflineBanner } from "./components/OfflineBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

// Eager-loaded pages (critical path)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages – bundle-ul inițial rămâne mic; Calendar, Audit, Rapoarte, Charts se încarcă doar la navigare.
// Recharts este în DirectorDashboardChart (chunk separat); secțiunile landing (Benefits, Features, etc.) sunt lazy în Index.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const SecretariatDashboard = lazy(() => import("./pages/SecretariatDashboard"));
const DirectorDashboard = lazy(() => import("./pages/DirectorDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const HomeroomDashboard = lazy(() => import("./pages/HomeroomDashboard"));
const ParentDashboard = lazy(() => import("./pages/ParentDashboard"));
const Grades = lazy(() => import("./pages/Grades"));
const Attendance = lazy(() => import("./pages/Attendance"));
const SchoolCalendar = lazy(() => import("./pages/SchoolCalendar"));
const Lessons = lazy(() => import("./pages/Lessons"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Library = lazy(() => import("./pages/resources/Library"));
const Manuals = lazy(() => import("./pages/resources/Manuals"));
const Magazines = lazy(() => import("./pages/resources/Magazines"));
const Documents = lazy(() => import("./pages/resources/Documents"));
const TakeAttendance = lazy(() => import("./pages/TakeAttendance"));
const Reports = lazy(() => import("./pages/Reports"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Announcements = lazy(() => import("./pages/Announcements"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Tickets = lazy(() => import("./pages/Tickets"));
const TeacherTickets = lazy(() => import("./pages/TeacherTickets"));
const Settings = lazy(() => import("./pages/Settings"));
const Developer = lazy(() => import("./pages/Developer"));
const DeveloperDirectorInvites = lazy(() => import("./pages/DeveloperDirectorInvites"));
const SystemHealth = lazy(() => import("./pages/SystemHealth"));

import { queryClient, persistOptions } from "@/lib/query-client";

const PageFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="space-y-4 w-full max-w-md px-8">
      <Skeleton className="h-8 w-3/4 rounded-lg" />
      <Skeleton className="h-4 w-1/2 rounded-lg" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  </div>
);

/** Fallback minimal pentru secțiunile grele (Calendar, Audit, Rapoarte) – mai puțin DOM/JS în timpul încărcării chunk-ului. */
const HeavySectionFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center" aria-busy="true" aria-label="Se încarcă...">
    <Spinner size="lg" className="text-primary" />
  </div>
);

/** Shorthand for a protected lazy route. Optional fallback for heavy sections (e.g. Calendar, Audit, Reports). */
function PR({
  roles,
  children,
  fallback,
}: {
  roles: AppRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <ProtectedRoute allowedRoles={roles}>
      <Suspense fallback={fallback ?? <PageFallback />}>{children}</Suspense>
    </ProtectedRoute>
  );
}

const allRoles: AppRole[] = ["student", "parent", "teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"];
const allPlusDev: AppRole[] = [...allRoles, "developer"];

/** Wraps authenticated tree with SchoolProvider (multi-tenant). Must be inside AuthProvider. */
function AppWithSchool({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  return (
    <SchoolProvider schoolIdFromProfile={profile?.school_id ?? null}>
      {children}
    </SchoolProvider>
  );
}

const App = () => (
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppWithSchool>
          <OfflineQueueProvider>
          <NavigationTransitionProvider>
            <ErrorBoundary>
              <div className="min-h-screen w-full max-w-full overflow-x-hidden">
              <OfflineBanner />
              <Routes>
              {/* Public */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Auth />} />

              {/* Role dashboards */}
              <Route path="/dashboard" element={<PR roles={["student"]}><Dashboard /></PR>} />
              <Route path="/parent" element={<PR roles={["parent"]}><ParentDashboard /></PR>} />
              <Route path="/teacher" element={<PR roles={["teacher", "homeroom_teacher", "director", "secretariat"]}><TeacherDashboard /></PR>} />
              <Route path="/teacher/attendance" element={<PR roles={["teacher", "homeroom_teacher"]}><TakeAttendance /></PR>} />
              <Route path="/homeroom" element={<PR roles={["homeroom_teacher", "director", "secretariat"]}><HomeroomDashboard /></PR>} />
              <Route path="/secretariat" element={<PR roles={["secretariat", "director"]}><SecretariatDashboard /></PR>} />
              <Route path="/director" element={<PR roles={["director"]}><DirectorDashboard /></PR>} />
              <Route path="/admin" element={<PR roles={["uat_admin"]}><AdminDashboard /></PR>} />
              <Route path="/admin-panel" element={<PR roles={["director", "secretariat"]}><AdminPanel /></PR>} />

              {/* Developer */}
              <Route path="/developer" element={<PR roles={["developer"]}><Developer /></PR>} />
              <Route path="/developer/invitations" element={<PR roles={["developer"]}><DeveloperDirectorInvites /></PR>} />
              {/* System Health – hidden, admin + developer only */}
              <Route path="/system-health" element={<PR roles={["uat_admin", "developer"]}><SystemHealth /></PR>} />

              {/* Feature pages */}
              <Route path="/dashboard/grades" element={<PR roles={["student", "parent"]}><Grades /></PR>} />
              <Route path="/dashboard/attendance" element={<PR roles={["student", "parent"]}><Attendance /></PR>} />
              <Route path="/dashboard/tickets" element={<PR roles={["parent"]}><Tickets /></PR>} />
              <Route path="/teacher/tickets" element={<PR roles={["teacher", "homeroom_teacher", "director", "secretariat"]}><TeacherTickets /></PR>} />
              {/* Calendar, Audit, Rapoarte: lazy + Suspense cu fallback minimal – chunk-ul se încarcă doar la acces, mai puțin RAM pe dispozitive slabe (ex. A30s) */}
              <Route path="/dashboard/calendar" element={<PR roles={allRoles} fallback={<HeavySectionFallback />}><SchoolCalendar /></PR>} />
              <Route path="/dashboard/schedule" element={<PR roles={allRoles}><Schedule /></PR>} />
              <Route path="/dashboard/lessons" element={<PR roles={["student", "teacher", "homeroom_teacher", "secretariat", "director"]}><Lessons /></PR>} />
              <Route path="/dashboard/settings" element={<PR roles={allPlusDev}><Settings /></PR>} />

              {/* Reports & Audit – lazy, chunk separat, fallback minimal */}
              <Route path="/reports" element={<PR roles={["teacher", "homeroom_teacher", "secretariat", "director", "uat_admin"]} fallback={<HeavySectionFallback />}><Reports /></PR>} />
              <Route path="/audit" element={<PR roles={["secretariat", "director", "uat_admin", "developer", "homeroom_teacher"]} fallback={<HeavySectionFallback />}><AuditLogs /></PR>} />

              {/* Communication */}
              <Route path="/announcements" element={<PR roles={allRoles}><Announcements /></PR>} />
              <Route path="/notifications" element={<PR roles={allRoles}><Notifications /></PR>} />

              {/* Resources */}
              <Route path="/resources/library" element={<PR roles={allRoles}><Library /></PR>} />
              <Route path="/resources/manuals" element={<PR roles={allRoles}><Manuals /></PR>} />
              <Route path="/resources/magazines" element={<PR roles={allRoles}><Magazines /></PR>} />
              <Route path="/resources/documents" element={<PR roles={allRoles}><Documents /></PR>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
            </ErrorBoundary>
          </NavigationTransitionProvider>
          </OfflineQueueProvider>
          </AppWithSchool>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
