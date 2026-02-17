import { ReactNode, useState, useCallback, memo } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import RoleSwitcher from "@/components/RoleSwitcher";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface DashboardLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Extra elements to render in the header (right side, before avatar) */
  headerActions?: ReactNode;
}

const DashboardHeader = memo(function DashboardHeader({
  title,
  subtitle,
  headerActions,
  displayName,
}: {
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  displayName: string;
}) {
  return (
    <header className="w-full h-16 border-b border-border bg-card flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg sm:text-xl font-semibold text-foreground truncate">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {headerActions}
        <ThemeToggle />
        <RoleSwitcher />
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold text-xs sm:text-sm">
          {displayName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
      </div>
    </header>
  );
});

export default function DashboardLayout({
  title,
  subtitle,
  children,
  headerActions,
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, profile } = useAuth();
  const displayName =
    profile?.full_name || user?.email?.split("@")[0] || "Utilizator";

  const onToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={onToggleSidebar}
      />

      <main
        className={cn(
          "w-full min-w-0 transition-all duration-300 will-change-transform pt-14 md:pt-0",
          sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64"
        )}
      >
        <DashboardHeader
          title={title}
          subtitle={subtitle}
          headerActions={headerActions}
          displayName={displayName}
        />

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
