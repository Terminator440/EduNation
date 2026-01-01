import { useState } from "react";
import { BookOpen } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Lessons = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <main className={cn("transition-all duration-300", sidebarCollapsed ? "ml-20" : "ml-64")}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Lecții și Materiale</h1>
            <p className="text-sm text-muted-foreground">Funcționalitate în dezvoltare</p>
          </div>
        </header>

        <div className="p-8">
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
