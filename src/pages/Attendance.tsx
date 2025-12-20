import { useMemo, useState } from "react";
import { UserCheck, UserX, Clock, Calendar } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useAttendanceForScope, useStudentScope } from "@/features/academics/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type UiStatus = "present" | "absent" | "late" | "excused";

const statusConfig: Record<UiStatus, { label: string; icon: typeof UserCheck; color: string; dot: string }> = {
  present: { label: "Prezent", icon: UserCheck, color: "bg-success/10 text-success", dot: "bg-success" },
  absent: { label: "Absent", icon: UserX, color: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  late: { label: "Întârziat", icon: Clock, color: "bg-warning/10 text-warning", dot: "bg-warning" },
  excused: { label: "Motivat", icon: Calendar, color: "bg-primary/10 text-primary", dot: "bg-primary" },
};

const mapDbStatus = (status: string): UiStatus => {
  switch (status) {
    case 'prezent':
      return 'present';
    case 'absent':
      return 'absent';
    case 'intarziat':
      return 'late';
    case 'motivat':
      return 'excused';
    default:
      return 'present';
  }
};

const Attendance = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filter, setFilter] = useState<"all" | "absent" | "late" | "excused">("all");

  const { user, activeRole } = useAuth();
  const scopeQuery = useStudentScope(activeRole, user?.id ?? null);
  const attendanceQuery = useAttendanceForScope(scopeQuery.data?.studentIds ?? []);

  const uiRows = useMemo(() => {
    return (attendanceQuery.data ?? []).map(r => {
      const uiStatus = mapDbStatus(r.status);
      return {
        id: r.id,
        date: r.date,
        subject: r.subject?.name ?? 'Materie necunoscută',
        status: uiStatus,
      };
    });
  }, [attendanceQuery.data]);

  const totalClasses = uiRows.length;
  const presentCount = uiRows.filter(a => a.status === "present").length;
  const absentCount = uiRows.filter(a => a.status === "absent").length;
  const lateCount = uiRows.filter(a => a.status === "late").length;
  const excusedCount = uiRows.filter(a => a.status === "excused").length;
  const attendanceRate = totalClasses === 0 ? '0.0' : (((presentCount + excusedCount) / totalClasses) * 100).toFixed(1);

  const filteredAttendance = filter === "all" 
    ? uiRows 
    : uiRows.filter(a => a.status === filter);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Prezența mea</h1>
            <p className="text-sm text-muted-foreground">Înregistrarea prezenței la cursuri</p>
          </div>
        </header>

        <div className="p-8">
          {(activeRole !== 'student' && activeRole !== 'parent') && (
            <Alert className="mb-8">
              <AlertTitle>Acces limitat</AlertTitle>
              <AlertDescription>
                Pagina „Prezență” este disponibilă doar pentru rolurile Elev și Părinte.
              </AlertDescription>
            </Alert>
          )}

          {(scopeQuery.isLoading || attendanceQuery.isLoading) && (
            <div className="space-y-4 mb-8">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          )}

          {(scopeQuery.isError || attendanceQuery.isError) && (
            <Alert variant="destructive" className="mb-8">
              <AlertTitle>Eroare</AlertTitle>
              <AlertDescription>
                Nu am putut încărca prezența. Verifică autentificarea și politicile RLS din Supabase.
              </AlertDescription>
            </Alert>
          )}
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Rata prezență</p>
              <p className="text-2xl font-bold text-success mt-1">{attendanceRate}%</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Prezențe</p>
              <p className="text-2xl font-bold text-foreground mt-1">{presentCount}</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Absențe</p>
              <p className="text-2xl font-bold text-destructive mt-1">{absentCount}</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Întârzieri</p>
              <p className="text-2xl font-bold text-warning mt-1">{lateCount}</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <p className="text-sm text-muted-foreground">Motivate</p>
              <p className="text-2xl font-bold text-primary mt-1">{excusedCount}</p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-2 mb-6">
            {[
              { key: "all", label: "Toate" },
              { key: "absent", label: "Absențe" },
              { key: "late", label: "Întârzieri" },
              { key: "excused", label: "Motivate" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key as typeof filter)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  filter === item.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Attendance List */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Istoric prezență</h3>
            </div>
            <div className="divide-y divide-border">
              {filteredAttendance.map((record, index) => {
                const config = statusConfig[record.status];
                const Icon = config.icon;
                return (
                  <div key={index} className="p-4 hover:bg-secondary/30 transition-colors flex items-center gap-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", config.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{record.subject}</span>
                        <span className={cn("w-2 h-2 rounded-full", config.dot)} />
                        <span className={cn("text-sm", config.color.split(" ")[1])}>{config.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">—</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{record.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Attendance;
