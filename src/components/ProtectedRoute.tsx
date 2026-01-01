import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, activeRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }

    if (!loading && user && allowedRoles && activeRole) {
      if (!allowedRoles.includes(activeRole)) {
        // Redirect to appropriate dashboard based on role
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
        navigate(roleRoutes[activeRole] || '/dashboard');
      }
    }
  }, [user, activeRole, loading, navigate, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
