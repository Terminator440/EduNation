import { useState } from "react";
import { Users, GraduationCap, FileText, Calendar, Plus, Upload, Search } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const mockStudents = [
  { id: "1", name: "Popescu Alexandru", class: "X-A", status: "Activ", enrolledDate: "2024-09-01" },
  { id: "2", name: "Ionescu Maria", class: "X-A", status: "Activ", enrolledDate: "2024-09-01" },
  { id: "3", name: "Georgescu Andrei", class: "X-B", status: "Inactiv", enrolledDate: "2024-09-01" },
  { id: "4", name: "Marinescu Elena", class: "XI-A", status: "Activ", enrolledDate: "2023-09-01" },
  { id: "5", name: "Dumitrescu Ion", class: "XI-B", status: "Activ", enrolledDate: "2023-09-01" },
];

const mockClasses = [
  { id: "1", name: "X-A", students: 28, teacher: "Prof. Ionescu Maria" },
  { id: "2", name: "X-B", students: 26, teacher: "Prof. Popescu Ana" },
  { id: "3", name: "XI-A", students: 30, teacher: "Prof. Georgescu Ion" },
  { id: "4", name: "XI-B", students: 25, teacher: "Prof. Dumitrescu Vlad" },
];

const SecretariatDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user, profile } = useAuth();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Utilizator';

  const filteredStudents = mockStudents.filter(student =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.class.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Panou Secretariat</h1>
            <p className="text-sm text-muted-foreground">Gestionare elevi și clase</p>
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
              subtitle="Anul școlar 2024-2025"
              icon={Users}
              variant="primary"
            />
            <StatsCard
              title="Clase"
              value="16"
              subtitle="4 nivele"
              icon={GraduationCap}
              variant="success"
            />
            <StatsCard
              title="Elevi noi"
              value="32"
              subtitle="Luna aceasta"
              icon={Users}
              variant="accent"
            />
            <StatsCard
              title="Rapoarte"
              value="8"
              subtitle="Pending"
              icon={FileText}
              variant="warning"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-4 mb-8">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Adaugă Elev
            </Button>
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Generează Raport
            </Button>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Students Table */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Lista Elevi</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Caută elev..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nume</TableHead>
                        <TableHead>Clasă</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data înscrierii</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.name}</TableCell>
                          <TableCell>{student.class}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              student.status === "Activ" 
                                ? "bg-success/10 text-success" 
                                : "bg-muted text-muted-foreground"
                            )}>
                              {student.status}
                            </span>
                          </TableCell>
                          <TableCell>{student.enrolledDate}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Classes */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Clase</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mockClasses.map((cls) => (
                    <div key={cls.id} className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground">{cls.name}</span>
                        <span className="text-sm text-muted-foreground">{cls.students} elevi</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{cls.teacher}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SecretariatDashboard;
