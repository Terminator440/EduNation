import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  GraduationCap, 
  Calendar, 
  Clock,
  BookText, 
  Library,
  Book,
  Settings,
  LogOut,
  ChevronLeft,
  UserCircle,
  Users,
  FileText,
  Shield,
  Bell,
  Mail,
  Key,
  ClipboardCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth, AppRole } from "@/hooks/useAuth";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const menuItemsByRole: Record<AppRole, { icon: any; label: string; href: string }[]> = {
  student: [
    { icon: LayoutDashboard, label: "Panou principal", href: "/dashboard" },
    { icon: Clock, label: "Orar", href: "/dashboard/schedule" },
    { icon: GraduationCap, label: "Note", href: "/dashboard/grades" },
    { icon: UserCircle, label: "Prezență", href: "/dashboard/attendance" },
    { icon: Calendar, label: "Calendar școlar", href: "/dashboard/calendar" },
    { icon: Library, label: "Bibliotecă", href: "/resources/library" },
    { icon: Book, label: "Manuale", href: "/resources/manuals" },
    { icon: BookText, label: "Reviste", href: "/resources/magazines" },
    { icon: FileText, label: "Documente", href: "/resources/documents" },
    { icon: Bell, label: "Anunțuri", href: "/announcements" },
    { icon: Mail, label: "Notificări", href: "/notifications" },
    { icon: BookText, label: "Lecții", href: "/dashboard/lessons" },
  ],
  parent: [
    { icon: LayoutDashboard, label: "Panou principal", href: "/parent" },
    { icon: Users, label: "Copiii mei", href: "/parent" },
    { icon: Clock, label: "Orar", href: "/dashboard/schedule" },
    { icon: GraduationCap, label: "Note", href: "/dashboard/grades" },
    { icon: UserCircle, label: "Prezență", href: "/dashboard/attendance" },
    { icon: Calendar, label: "Calendar școlar", href: "/dashboard/calendar" },
    { icon: Library, label: "Bibliotecă", href: "/resources/library" },
    { icon: Book, label: "Manuale", href: "/resources/manuals" },
    { icon: BookText, label: "Reviste", href: "/resources/magazines" },
    { icon: FileText, label: "Documente", href: "/resources/documents" },
    { icon: Bell, label: "Anunțuri", href: "/announcements" },
    { icon: Mail, label: "Notificări", href: "/notifications" },
  ],
  teacher: [
    { icon: LayoutDashboard, label: "Panou principal", href: "/teacher" },
    { icon: Users, label: "Elevii mei", href: "/teacher" },
    { icon: GraduationCap, label: "Catalog", href: "/teacher" },
    { icon: ClipboardCheck, label: "Fă prezența", href: "/teacher/attendance" },
    { icon: Clock, label: "Orar", href: "/dashboard/schedule" },
    { icon: FileText, label: "Rapoarte", href: "/reports" },
    { icon: Bell, label: "Anunțuri", href: "/announcements" },
    { icon: Mail, label: "Notificări", href: "/notifications" },
    { icon: BookText, label: "Lecții", href: "/dashboard/lessons" },
    { icon: Calendar, label: "Calendar școlar", href: "/dashboard/calendar" },
    { icon: Library, label: "Bibliotecă", href: "/resources/library" },
    { icon: Book, label: "Manuale", href: "/resources/manuals" },
    { icon: BookText, label: "Reviste", href: "/resources/magazines" },
    { icon: FileText, label: "Documente", href: "/resources/documents" },
  ],
  homeroom_teacher: [
    { icon: Key, label: "Clasa mea", href: "/homeroom" },
    { icon: GraduationCap, label: "Catalog Profesor", href: "/teacher" },
    { icon: ClipboardCheck, label: "Fă prezența", href: "/teacher/attendance" },
    { icon: Clock, label: "Orar", href: "/dashboard/schedule" },
    { icon: FileText, label: "Rapoarte", href: "/reports" },
    { icon: Bell, label: "Anunțuri", href: "/announcements" },
    { icon: Mail, label: "Notificări", href: "/notifications" },
    { icon: Calendar, label: "Calendar școlar", href: "/dashboard/calendar" },
    { icon: Library, label: "Bibliotecă", href: "/resources/library" },
    { icon: Book, label: "Manuale", href: "/resources/manuals" },
    { icon: BookText, label: "Reviste", href: "/resources/magazines" },
    { icon: FileText, label: "Documente", href: "/resources/documents" },
  ],
  secretariat: [
    { icon: LayoutDashboard, label: "Panou Secretariat", href: "/secretariat" },
    { icon: Users, label: "Elevi", href: "/secretariat" },
    { icon: GraduationCap, label: "Clase", href: "/secretariat" },
    { icon: Clock, label: "Orar", href: "/dashboard/schedule" },
    { icon: FileText, label: "Rapoarte", href: "/reports" },
    { icon: Bell, label: "Anunțuri", href: "/announcements" },
    { icon: Mail, label: "Notificări", href: "/notifications" },
    { icon: Shield, label: "Director", href: "/director" },
    { icon: Calendar, label: "Calendar școlar", href: "/dashboard/calendar" },
    { icon: Library, label: "Bibliotecă", href: "/resources/library" },
    { icon: Book, label: "Manuale", href: "/resources/manuals" },
    { icon: BookText, label: "Reviste", href: "/resources/magazines" },
    { icon: FileText, label: "Documente", href: "/resources/documents" },
  ],
  director: [
    { icon: LayoutDashboard, label: "Panou Director", href: "/director" },
    { icon: Key, label: "Invitații", href: "/director" },
    { icon: Users, label: "Secretariat", href: "/secretariat" },
    { icon: GraduationCap, label: "Catalog Profesor", href: "/teacher" },
    { icon: Clock, label: "Orar", href: "/dashboard/schedule" },
    { icon: FileText, label: "Rapoarte", href: "/reports" },
    { icon: Shield, label: "Audit", href: "/audit" },
    { icon: Bell, label: "Anunțuri", href: "/announcements" },
    { icon: Mail, label: "Notificări", href: "/notifications" },
    { icon: Calendar, label: "Calendar școlar", href: "/dashboard/calendar" },
    { icon: Library, label: "Bibliotecă", href: "/resources/library" },
    { icon: Book, label: "Manuale", href: "/resources/manuals" },
    { icon: BookText, label: "Reviste", href: "/resources/magazines" },
    { icon: FileText, label: "Documente", href: "/resources/documents" },
  ],
  uat_admin: [
    { icon: LayoutDashboard, label: "Panou principal", href: "/admin" },
    { icon: Users, label: "Utilizatori", href: "/admin" },
    { icon: Clock, label: "Orar", href: "/dashboard/schedule" },
    { icon: FileText, label: "Rapoarte", href: "/reports" },
    { icon: Bell, label: "Anunțuri", href: "/announcements" },
    { icon: Mail, label: "Notificări", href: "/notifications" },
    { icon: Calendar, label: "Calendar școlar", href: "/dashboard/calendar" },
    { icon: Library, label: "Bibliotecă", href: "/resources/library" },
    { icon: Book, label: "Manuale", href: "/resources/manuals" },
    { icon: BookText, label: "Reviste", href: "/resources/magazines" },
    { icon: FileText, label: "Documente", href: "/resources/documents" },
    { icon: Settings, label: "Configurare", href: "/admin" },
  ],
  developer: [
    { icon: Shield, label: "Diagnostic sistem", href: "/developer" },
    { icon: Shield, label: "Audit Log", href: "/audit" },
    { icon: Key, label: "Invitații Director", href: "/developer/invitations" },
  ],
};

const homeRoutes: Record<AppRole, string> = {
  student: '/dashboard',
  parent: '/parent',
  teacher: '/teacher',
  homeroom_teacher: '/homeroom',
  secretariat: '/secretariat',
  director: '/director',
  uat_admin: '/admin',
  developer: '/developer',
};

const Sidebar = ({ isCollapsed, onToggle }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, activeRole } = useAuth();

  const menuItems = activeRole ? menuItemsByRole[activeRole] : menuItemsByRole.student;
  const homeHref = activeRole ? homeRoutes[activeRole] : '/dashboard';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 z-40",
      isCollapsed ? "w-20" : "w-64"
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <Link to={homeHref} className="flex items-center gap-3">
          <img src="/logo.png" alt="EduNation" className={cn("h-10 w-auto flex-shrink-0 object-contain", isCollapsed ? "mx-auto" : "")} />
          {!isCollapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">EduNation</span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            "transition-transform",
            isCollapsed && "rotate-180"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Navigation */}
      {/*
        NOTE: With role-specific menus, the item list can get long.
        Make the navigation area scrollable so the bottom actions
        (Settings / Logout) never disappear.
      */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 sidebar-nav-scroll">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <li key={item.href + item.label}>
                <Link
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                    isActive 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 flex-shrink-0",
                    isActive ? "text-sidebar-primary-foreground" : "text-muted-foreground group-hover:text-sidebar-foreground"
                  )} />
                  {!isCollapsed && (
                    <span className="font-medium">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-sidebar-border">
        <Link
          to="/dashboard/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
          {!isCollapsed && <span className="font-medium">Setări</span>}
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-colors mt-1"
        >
          <LogOut className="w-5 h-5" />
          {!isCollapsed && <span className="font-medium">Deconectare</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
