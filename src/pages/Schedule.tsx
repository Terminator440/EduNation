import { useMemo, useState } from "react";
import { CalendarX2, Clock } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import RoleSwitcher from "@/components/RoleSwitcher";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useStudentScope } from "@/features/academics/queries";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type TimetableRow = {
  id: string;
  weekday: number;
  period: number;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  classes?: { name: string } | null;
  subjects?: { name: string } | null;
};

const weekdayLabel = (d: number) =>
  ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"][d] ?? "Zi";

export default function Schedule() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, profile, activeRole } = useAuth();
  const scopeQuery = useStudentScope(activeRole, user?.id ?? null);

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Utilizator";
  const todayWeekday = new Date().getDay();

  const classIdQuery = useQuery({
    queryKey: ["schedule-class", scopeQuery.data?.studentIds],
    enabled: (scopeQuery.data?.studentIds?.length ?? 0) > 0,
    queryFn: async () => {
      const studentId = scopeQuery.data!.studentIds[0];
      const res = await supabase.from("students").select("class_id").eq("id", studentId).maybeSingle();
      const row = assertSupabaseOk(res, "students.select(class_id)") as any;
      return row?.class_id ?? null;
    },
  });

  const mode = useMemo<"teacher" | "class" | "none">(() => {
    if (!activeRole) return "none";
    if (["teacher", "homeroom_teacher"].includes(activeRole)) return "teacher";
    if (["student", "parent"].includes(activeRole)) return "class";
    // staff roles can still view a generic/empty state here
    return "none";
  }, [activeRole]);

  const timetableQuery = useQuery({
    queryKey: ["timetable", mode, todayWeekday, user?.id, classIdQuery.data],
    enabled:
      Boolean(user?.id) &&
      ((mode === "teacher") || (mode === "class" && Boolean(classIdQuery.data))),
    queryFn: async (): Promise<TimetableRow[]> => {
      if (mode === "teacher") {
        const res = await supabase
          .from("timetable_entries")
          .select("id,weekday,period,start_time,end_time,room, classes(name), subjects(name)")
          .eq("teacher_id", user!.id)
          .eq("weekday", todayWeekday)
          .order("period", { ascending: true });
        return assertSupabaseOk(res, "timetable_entries.select(teacher)") as any;
      }

      const res = await supabase
        .from("timetable_entries")
        .select("id,weekday,period,start_time,end_time,room, classes(name), subjects(name)")
        .eq("class_id", classIdQuery.data as any)
        .eq("weekday", todayWeekday)
        .order("period", { ascending: true });
      return assertSupabaseOk(res, "timetable_entries.select(class)") as any;
    },
  });

  const rows = timetableQuery.data ?? [];

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
          {(mode === "class" && !classIdQuery.data && !classIdQuery.isLoading) && (
            <Alert className="mb-6 border-amber-300/60 bg-amber-50/30 dark:bg-amber-500/10">
              <CalendarX2 className="h-4 w-4" />
              <div>
                <AlertTitle>Nu ești asociat(ă) cu o clasă</AlertTitle>
                <AlertDescription>
                  Pentru a vedea orarul, contul trebuie legat de un elev și o clasă.
                </AlertDescription>
              </div>
            </Alert>
          )}

          {rows.length === 0 ? (
            <Alert className="border-amber-300/60 bg-amber-50/30 dark:bg-amber-500/10">
              <CalendarX2 className="h-4 w-4" />
              <div>
                <AlertTitle>Nu există ore în orar pentru azi</AlertTitle>
                <AlertDescription>
                  Școala nu a publicat încă orarul pentru ziua curentă sau nu sunt ore alocate pe contul tău.
                </AlertDescription>
              </div>
            </Alert>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Orele de azi</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {rows.map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.subjects?.name ?? "Materie"}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {r.classes?.name ? `Clasa ${r.classes.name}` : ""}{r.room ? (r.classes?.name ? ` • Sala ${r.room}` : `Sala ${r.room}`) : ""}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground flex-shrink-0 text-right">
                        <div>Ora {r.period}</div>
                        <div>{(r.start_time ?? "").slice(0, 5)}{r.end_time ? `–${r.end_time.slice(0, 5)}` : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
