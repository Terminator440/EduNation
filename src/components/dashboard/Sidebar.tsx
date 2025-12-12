import { Link, useLocation } from "react-router-dom";
import { 
  BookOpen, 
  LayoutDashboard, 
  GraduationCap, 
  Calendar, 
  BookText, 
  Settings,
  LogOut,
  ChevronLeft,
  UserCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: "Panou principal", href: "/dashboard" },
  { icon: GraduationCap, label: "Note", href: "/dashboard/grades" },
  { icon: UserCircle, label: "Prezență", href: "/dashboard/attendance" },
  { icon: Calendar, label: "Calendar", href: "/dashboard/calendar" },
  { icon: BookText, label: "Lecții", href: "/dashboard/lessons" },
];

const Sidebar = ({ isCollapsed, onToggle }: SidebarProps) => {
  const location = useLocation();

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 z-40",
      isCollapsed ? "w-20" : "w-64"
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-md flex-shrink-0">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">EduCatalog</span>
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
      <nav className="flex-1 py-6 px-3">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <li key={item.href}>
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
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-colors mt-1"
        >
          <LogOut className="w-5 h-5" />
          {!isCollapsed && <span className="font-medium">Deconectare</span>}
        </Link>
      </div>
    </aside>
  );
};

export default Sidebar;
