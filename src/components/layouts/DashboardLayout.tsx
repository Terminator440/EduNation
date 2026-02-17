import { ReactNode, useState } from "react";
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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "ml-20" : "ml-64"
        )}
      >
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            {headerActions}
            <ThemeToggle />
            <RoleSwitcher />
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
              {displayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          </div>
        </header>

        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
