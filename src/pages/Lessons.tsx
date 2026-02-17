import { useState, useCallback } from "react";
import { BookOpen } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Lessons = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const onToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />

      <main className={cn("w-full min-w-0 transition-all duration-300 pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64")}>
        <header className="w-full h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Lecții și Materiale</h1>
            <p className="text-sm text-muted-foreground">Funcționalitate în dezvoltare</p>
          </div>
        </header>

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Lecții
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Tabela `lessons` nu există încă în baza de date. Această funcționalitate va fi disponibilă după configurare.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Lessons;
