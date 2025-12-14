import { useState } from "react";
import { Users, GraduationCap, Key, CheckCircle, XCircle, Clock, Copy } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

const mockStudents = [
  { id: "1", number: 1, name: "Andrei Alexandru", isActive: true, activationCode: null, email: "andrei@example.com" },
  { id: "2", number: 2, name: "Bălan Maria", isActive: true, activationCode: null, email: "maria@example.com" },
  { id: "3", number: 3, name: "Ciobanu Ion", isActive: false, activationCode: "ABC12345", email: null },
  { id: "4", number: 4, name: "Dobre Elena", isActive: false, activationCode: null, email: null },
  { id: "5", number: 5, name: "Ene Vasile", isActive: true, activationCode: null, email: "vasile@example.com" },
  { id: "6", number: 6, name: "Florescu Ana", isActive: false, activationCode: "XYZ98765", email: null },
];

const HomeroomDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const { user, profile } = useAuth();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Utilizator';

  const activeStudents = mockStudents.filter(s => s.isActive).length;
  const pendingActivation = mockStudents.filter(s => !s.isActive && s.activationCode).length;
  const notActivated = mockStudents.filter(s => !s.isActive && !s.activationCode).length;

  const handleGenerateCode = async (studentId: string) => {
    setGeneratingCode(studentId);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setGeneratingCode(null);
    toast({
      title: "Cod generat!",
      description: "Codul de activare a fost generat cu succes.",
    });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Copiat!",
      description: "Codul a fost copiat în clipboard.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Clasa Mea - X-A</h1>
            <p className="text-sm text-muted-foreground">Diriginte: {displayName}</p>
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
              value={mockStudents.length.toString()}
              subtitle="Clasa X-A"
              icon={Users}
              variant="primary"
            />
            <StatsCard
              title="Conturi Active"
              value={activeStudents.toString()}
              subtitle="Activați"
              icon={CheckCircle}
              variant="success"
            />
            <StatsCard
              title="Așteaptă Activare"
              value={pendingActivation.toString()}
              subtitle="Cod generat"
              icon={Clock}
              variant="warning"
            />
            <StatsCard
              title="Neactivați"
              value={notActivated.toString()}
              subtitle="Fără cod"
              icon={XCircle}
              variant="accent"
            />
          </div>

          {/* Students Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Lista Elevilor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Nr.</TableHead>
                    <TableHead>Nume</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cod Activare</TableHead>
                    <TableHead className="w-40">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.number}</TableCell>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                          student.isActive 
                            ? "bg-success/10 text-success" 
                            : student.activationCode
                            ? "bg-warning/10 text-warning"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {student.isActive ? (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              Activ
                            </>
                          ) : student.activationCode ? (
                            <>
                              <Clock className="h-3 w-3" />
                              Așteaptă
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" />
                              Inactiv
                            </>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.email || "-"}
                      </TableCell>
                      <TableCell>
                        {student.activationCode ? (
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                              {student.activationCode}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCopyCode(student.activationCode!)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!student.isActive && !student.activationCode && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => handleGenerateCode(student.id)}
                            disabled={generatingCode === student.id}
                          >
                            <Key className="h-4 w-4" />
                            {generatingCode === student.id ? "Se generează..." : "Generează Cod"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default HomeroomDashboard;
