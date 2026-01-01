import { useState } from "react";
import { Bell } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Notifications = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <div className="flex-1">
        <div className="p-6 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Bell className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Notificări</h1>
                <p className="text-muted-foreground">Ești la zi.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <RoleSwitcher />
            </div>
          </div>
        </div>

        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Inbox</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-8">
                Sistemul de notificări nu este încă configurat. Tabela `notifications` trebuie creată.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
