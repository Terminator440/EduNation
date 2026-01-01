import { useState } from "react";
import { CalendarX2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import RoleSwitcher from "@/components/RoleSwitcher";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const weekdayLabel = (d: number) =>
  ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"][d] ?? "Zi";

export default function Schedule() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, profile } = useAuth();

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Utilizator";
  const todayWeekday = new Date().getDay();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <main className={cn("transition-all duration-300", sidebarCollapsed ? "ml-20" : "ml-64")}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Orar</h1>
            <p className="text-sm text-muted-foreground">{weekdayLabel(todayWeekday)} • {displayName}</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
              {displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="p-8">
          <Alert className="border-amber-300/60 bg-amber-50/30 dark:bg-amber-500/10">
            <CalendarX2 className="h-4 w-4" />
            <div>
              <AlertTitle>Orarul nu este disponibil</AlertTitle>
              <AlertDescription>
                Tabela `timetable_entries` nu există încă în baza de date. Contactează administratorul pentru configurare.
              </AlertDescription>
            </div>
          </Alert>
        </div>
      </main>
    </div>
  );
}
