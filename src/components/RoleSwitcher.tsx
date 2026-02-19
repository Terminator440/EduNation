import { ChevronDown, GraduationCap, Users, UserCircle, School, Building, Shield, Globe } from 'lucide-react';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const roleConfig: Record<AppRole, { label: string; icon: typeof GraduationCap; color: string; route: string }> = {
  student: { label: 'Elev', icon: GraduationCap, color: 'text-primary', route: '/dashboard' },
  parent: { label: 'Părinte', icon: UserCircle, color: 'text-green-500', route: '/parent' },
  teacher: { label: 'Profesor', icon: Users, color: 'text-blue-500', route: '/teacher' },
  homeroom_teacher: { label: 'Diriginte', icon: School, color: 'text-purple-500', route: '/homeroom' },
  secretariat: { label: 'Secretariat', icon: Building, color: 'text-orange-500', route: '/secretariat' },
  director: { label: 'Director', icon: Shield, color: 'text-red-500', route: '/director' },
  uat_admin: { label: 'Admin UAT', icon: Globe, color: 'text-gray-500', route: '/admin' },
  developer: { label: 'Developer', icon: Shield, color: 'text-emerald-500', route: '/developer' },
};

/**
 * Context Switcher: schimbă doar perspectiva UI ("View as").
 * Permisiunile se verifică în backend/RLS; rolurile vin din DB (user_roles).
 * Afișat doar în dev sau când VITE_ENABLE_ROLE_SWITCHER=true.
 */
const RoleSwitcher = () => {
  const { userRoles, activeRole, switchRole } = useAuth();
  const navigate = useNavigate();

  const allowRoleSwitch =
    import.meta.env.DEV === true ||
    import.meta.env.VITE_ENABLE_ROLE_SWITCHER === "true";

  if (!allowRoleSwitch) {
    return null;
  }

  if (!activeRole || userRoles.length <= 1) {
    if (!activeRole) return null;
    
    const config = roleConfig[activeRole];
    const Icon = config.icon;
    
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className="text-sm font-medium">{config.label}</span>
      </div>
    );
  }

  const currentConfig = roleConfig[activeRole];
  const CurrentIcon = currentConfig.icon;

  const handleRoleSwitch = async (role: AppRole) => {
    await switchRole(role);
    navigate(roleConfig[role].route);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CurrentIcon className={`w-4 h-4 ${currentConfig.color}`} />
          <span>View as: {currentConfig.label}</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {userRoles.map((role) => {
          const config = roleConfig[role];
          const Icon = config.icon;
          const isActive = role === activeRole;
          
          return (
            <DropdownMenuItem
              key={role}
              onClick={() => handleRoleSwitch(role)}
              className={isActive ? 'bg-muted' : ''}
            >
              <Icon className={`w-4 h-4 mr-2 ${config.color}`} />
              {config.label}
              {isActive && <span className="ml-auto text-xs text-muted-foreground">activ</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RoleSwitcher;
