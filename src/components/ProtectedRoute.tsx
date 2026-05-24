import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { Spinner } from '@/components/ui/spinner';
import { Wrench } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

const ADMIN_OR_DEV: AppRole[] = ['uat_admin', 'developer'];

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, activeRole, loading } = useAuth();
  const { maintenanceMode, isLoading: maintenanceLoading } = useMaintenanceMode();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }

    if (!loading && user && allowedRoles) {
      // No active role yet resolved, or role not permitted for this route → redirect away.
      if (!activeRole || !allowedRoles.includes(activeRole)) {
        const roleRoutes: Record<AppRole, string> = {
          student: '/dashboard',
          parent: '/parent',
          teacher: '/teacher',
          homeroom_teacher: '/homeroom',
          secretariat: '/secretariat',
          director: '/director',
          uat_admin: '/admin',
          developer: '/developer',
        };
        navigate(activeRole ? (roleRoutes[activeRole] || '/dashboard') : '/auth');
      }
    }
  }, [user, activeRole, loading, navigate, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="md" className="text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Do not render protected children while the role guard is pending a redirect.
  // This prevents a brief flash of role-restricted content for users whose
  // active role is missing or not permitted on this route.
  if (allowedRoles && (!activeRole || !allowedRoles.includes(activeRole))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="md" className="text-primary" />
      </div>
    );
  }

  const isAdminOrDev = activeRole && ADMIN_OR_DEV.includes(activeRole);
  const showMaintenancePage = !maintenanceLoading && maintenanceMode && !isAdminOrDev;

  if (showMaintenancePage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Wrench className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Mentenanță în curs
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Aplicația este temporar indisponibilă pentru lucrări de mentenanță. Te rugăm să revii mai târziu.
          </p>
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="text-sm text-primary hover:underline"
          >
            Înapoi la autentificare
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
