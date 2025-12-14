import { useState } from "react";
import { Users, GraduationCap, TrendingUp, FileText, Shield, Bell, BarChart3 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const mockAuditLogs = [
  { id: "1", user: "Prof. Ionescu Maria", role: "Profesor", action: "A adăugat notă", date: "2024-12-14 10:30", entity: "Popescu Alexandru" },
  { id: "2", user: "Secretariat Admin", role: "Secretariat", action: "A creat cont elev", date: "2024-12-14 09:15", entity: "Marinescu Elena" },
  { id: "3", user: "Prof. Georgescu Ion", role: "Diriginte", action: "A generat cod activare", date: "2024-12-13 16:45", entity: "Clasa X-B" },
  { id: "4", user: "Prof. Popescu Ana", role: "Profesor", action: "A marcat absență", date: "2024-12-13 14:20", entity: "Ionescu Andrei" },
  { id: "5", user: "Director", role: "Director", action: "A publicat anunț", date: "2024-12-13 11:00", entity: "Anunț general" },
];

const mockReports = [
  { id: "1", title: "Raport Prezență Decembrie", status: "Generat", date: "2024-12-14" },
  { id: "2", title: "Statistici Note Semestrul I", status: "În procesare", date: "2024-12-13" },
  { id: "3", title: "Raport Anual 2024", status: "Draft", date: "2024-12-10" },
];

const DirectorDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, profile } = useAuth();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Utilizator';

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Panou Director</h1>
            <p className="text-sm text-muted-foreground">Liceul Teoretic „Nicolae Bălcescu"</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
              {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Total Elevi"
              value="420"
              subtitle="12 clase"
              icon={Users}
              variant="primary"
            />
            <StatsCard
              title="Profesori"
              value="45"
              subtitle="Activi"
              icon={GraduationCap}
              variant="success"
            />
            <StatsCard
              title="Media Generală"
              value="8.45"
              subtitle="Semestrul I"
              icon={TrendingUp}
              variant="accent"
              trend={{ value: 2, isPositive: true }}
            />
            <StatsCard
              title="Prezență Medie"
              value="94%"
              subtitle="Săptămâna curentă"
              icon={BarChart3}
              variant="warning"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-4 mb-8">
            <Button className="gap-2">
              <Bell className="h-4 w-4" />
              Publică Anunț
            </Button>
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Generează Raport
            </Button>
            <Button variant="outline" className="gap-2">
              <Shield className="h-4 w-4" />
              Gestionare Roluri
            </Button>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Audit Logs */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Jurnal Audit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Utilizator</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Acțiune</TableHead>
                        <TableHead>Entitate</TableHead>
                        <TableHead>Data/Ora</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mockAuditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">{log.user}</TableCell>
                          <TableCell>
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              {log.role}
                            </span>
                          </TableCell>
                          <TableCell>{log.action}</TableCell>
                          <TableCell className="text-muted-foreground">{log.entity}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{log.date}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Reports */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Rapoarte Recente
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mockReports.map((report) => (
                    <div key={report.id} className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-foreground">{report.title}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          report.status === "Generat" 
                            ? "bg-success/10 text-success"
                            : report.status === "În procesare"
                            ? "bg-warning/10 text-warning"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {report.status}
                        </span>
                        <span className="text-xs text-muted-foreground">{report.date}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Statistici Rapide</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Absențe azi</span>
                    <span className="font-semibold">23</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Note acordate azi</span>
                    <span className="font-semibold">156</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Utilizatori activi</span>
                    <span className="font-semibold">312</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DirectorDashboard;
