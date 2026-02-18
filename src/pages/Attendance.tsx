import { useMemo, useState } from "react";
import { UserCheck, UserX, Clock, Calendar } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useAttendanceForScope, useStudentScope } from "@/features/academics/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type UiStatus = "present" | "absent" | "late" | "excused" | "pending";

const statusConfig: Record<UiStatus, { label: string; icon: typeof UserCheck; color: string; dot: string }> = {
  present: { label: "Prezent", icon: UserCheck, color: "bg-success/10 text-success", dot: "bg-success" },
  absent: { label: "Nemotivat", icon: UserX, color: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  late: { label: "Întârziat", icon: Clock, color: "bg-warning/10 text-warning", dot: "bg-warning" },
  excused: { label: "Motivat", icon: Calendar, color: "bg-primary/10 text-primary", dot: "bg-primary" },
  pending: { label: "În așteptare", icon: Clock, color: "bg-muted-foreground/20 text-muted-foreground", dot: "bg-muted-foreground" },
};

const mapDbStatus = (status: string): UiStatus => {
  switch (status) {
    case "present": case "prezent": return "present";
    case "unexcused": case "absent": return "absent";
    case "intarziat": return "late";
    case "motivated": case "motivat": return "excused";
    case "pending": return "pending";
    default: return "present";
  }
};

const Attendance = () => {
  const [filter, setFilter] = useState<"all" | "absent" | "late" | "excused" | "pending">("all");
  const { user, activeRole } = useAuth();
  const scopeQuery = useStudentScope(activeRole, user?.id ?? null);
  const attendanceQuery = useAttendanceForScope(scopeQuery.data?.studentIds ?? []);

  const uiRows = useMemo(() => {
    return (attendanceQuery.data ?? []).map(r => ({
      id: r.id,
      date: r.date,
      subject: r.subject?.name ?? "Materie necunoscută",
      status: mapDbStatus(r.status),
    }));
  }, [attendanceQuery.data]);

  const totalClasses = uiRows.length;
  const presentCount = uiRows.filter(a => a.status === "present").length;
  const absentCount = uiRows.filter(a => a.status === "absent").length;
  const lateCount = uiRows.filter(a => a.status === "late").length;
  const excusedCount = uiRows.filter(a => a.status === "excused").length;
  const attendanceRate = totalClasses === 0 ? "0.0" : (((presentCount + excusedCount) / totalClasses) * 100).toFixed(1);

  const filteredAttendance = filter === "all" ? uiRows : uiRows.filter(a => a.status === filter);

  const isLoading = scopeQuery.isLoading || attendanceQuery.isLoading;

  return (
    <DashboardLayout title="Prezența mea" subtitle="Înregistrarea prezenței la cursuri">
      {(scopeQuery.isError || attendanceQuery.isError) && (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Eroare</AlertTitle>
          <AlertDescription>Nu am putut încărca prezența. Verifică autentificarea.</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        {isLoading ? (
          // Skeleton for stats cards
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl p-5 border border-border">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: "all", label: "Toate" },
          { key: "absent", label: "Nemotivate" },
          { key: "pending", label: "În așteptare" },
          { key: "late", label: "Întârzieri" },
          { key: "excused", label: "Motivate" },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key as typeof filter)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              filter === item.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
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
          {isLoading ? (
            // Skeleton for attendance list items
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))
          ) : filteredAttendance.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nu există înregistrări de prezență pentru filtrele selectate.
            </div>
          ) : (
            filteredAttendance.map((record) => {
              const config = statusConfig[record.status];
              const Icon = config.icon;
              return (
                <div key={record.id} className="p-4 hover:bg-secondary/30 transition-colors flex items-center gap-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", config.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{record.subject}</span>
                      <span className={cn("w-2 h-2 rounded-full", config.dot)} />
                      <span className={cn("text-sm", config.color.split(" ")[1])}>{config.label}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{record.date}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Attendance;
