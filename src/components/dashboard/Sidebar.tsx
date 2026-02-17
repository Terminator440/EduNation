import { useState } from "react";
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
  Menu,
  X,
  UserCircle,
  Users,
  FileText,
  Shield,
  Bell,
  Mail,
  Key,
  ClipboardCheck,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { NotificationsPopover } from "@/components/notifications/NotificationsPopover";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

/** Renders the sidebar navigation content (shared between desktop sidebar and mobile sheet) */
function SidebarContent({
  menuItems,
  homeHref,
  location,
  onLinkClick,
  onSignOut,
  isCollapsed,
  onToggle,
  showToggle,
}: {
  menuItems: MenuItem[];
  homeHref: string;
  location: ReturnType<typeof useLocation>;
  onLinkClick: () => void;
  onSignOut: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
  showToggle: boolean;
}) {
  return (
    <>
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border gap-2 shrink-0">
        <Link to={homeHref} onClick={onLinkClick} className="flex items-center gap-3 min-w-0">
          <img src="/logo.png" alt="EduNation" className={cn("h-10 w-auto flex-shrink-0 object-contain", isCollapsed ? "mx-auto" : "")} />
          {!isCollapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">EduNation</span>
          )}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <NotificationsPopover />
          {showToggle ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className={cn("transition-transform", isCollapsed && "rotate-180")}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={onLinkClick}
              aria-label="Închide meniul"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 sidebar-nav-scroll">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <li key={item.href + item.label}>
                <Link
                  to={item.href}
                  onClick={onLinkClick}
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

      <div className="p-3 border-t border-sidebar-border shrink-0">
        <Link
          to="/dashboard/settings"
          onClick={onLinkClick}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
          {!isCollapsed && <span className="font-medium">Setări</span>}
        </Link>
        <button
          onClick={() => {
            onLinkClick();
            onSignOut();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-colors mt-1"
        >
          <LogOut className="w-5 h-5" />
          {!isCollapsed && <span className="font-medium">Deconectare</span>}
        </button>
      </div>
    </>
  );
}

interface MenuItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

const menuItemsByRole: Record<AppRole, MenuItem[]> = {
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = activeRole ? menuItemsByRole[activeRole] : menuItemsByRole.student;
  const homeHref = activeRole ? homeRoutes[activeRole] : '/dashboard';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const closeMobile = () => setMobileOpen(false);

  const sidebarContentProps = {
    menuItems,
    homeHref,
    location,
    isCollapsed,
    onToggle,
    onSignOut: handleSignOut,
  };

  return (
    <>
      {/* Mobile: hamburger + Sheet */}
      <div className="md:hidden fixed inset-x-0 top-0 z-40 flex items-center w-full h-14 px-4 bg-card/95 backdrop-blur-sm border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Deschide meniul"
          className="text-foreground"
        >
          <Menu className="w-6 h-6" />
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-full max-w-[85vw] sm:max-w-sm p-0 gap-0 flex flex-col bg-sidebar border-sidebar-border [&>button]:hidden"
        >
          <div className="flex flex-col h-full min-h-0">
            <SidebarContent
              {...sidebarContentProps}
              isCollapsed={false}
              onLinkClick={closeMobile}
              showToggle={false}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop: fixed sidebar */}
      <aside className={cn(
        "hidden md:flex fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex-col transition-all duration-300 z-40",
        isCollapsed ? "w-20" : "w-64"
      )}>
        <SidebarContent
          {...sidebarContentProps}
          onLinkClick={() => {}}
          showToggle={true}
        />
      </aside>
    </>
  );
};

export default Sidebar;
