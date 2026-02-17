import { useEffect, useMemo, useState, useCallback } from "react";
import { CalendarX2, Clock } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import RoleSwitcher from "@/components/RoleSwitcher";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const WEEKDAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];

type TimetableEntry = {
  id: string;
  class_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
  weekday: number;
  period: number;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  subjects: { name: string } | null;
  classes: { name: string } | null;
};

export default function Schedule() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const onToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);
  const { user, profile, activeRole } = useAuth();
  const [viewMode, setViewMode] = useState<"class" | "teacher">("class");

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Utilizator";
  const todayWeekday = new Date().getDay();
  const adjustedToday = todayWeekday === 0 ? 6 : todayWeekday - 1; // Adjust Sunday to end

  // Fetch classes for selection
  const classesQuery = useQuery({
    queryKey: ["classes-for-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, year, section")
        .order("year")
        .order("section");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // Set initial class when loaded; reset if selected class no longer in list
  useEffect(() => {
    const classes = classesQuery.data ?? [];
    if (classes.length === 0) return;
    const ids = new Set(classes.map((c) => c.id));
    setSelectedClassId((prev) => {
      if (!prev || !ids.has(prev)) return classes[0].id;
      return prev;
    });
  }, [classesQuery.data]);

  // Fetch timetable entries
  const timetableQuery = useQuery({
    queryKey: ["timetable", viewMode, selectedClassId, user?.id],
    enabled: viewMode === "teacher" ? !!user?.id : !!selectedClassId,
    queryFn: async () => {
      let query = supabase
        .from("timetable_entries")
        .select("id, class_id, subject_id, teacher_id, weekday, period, start_time, end_time, room, subjects(name), classes(name)")
        .order("weekday")
        .order("period");

      if (viewMode === "class" && selectedClassId) {
        query = query.eq("class_id", selectedClassId);
      } else if (viewMode === "teacher" && user?.id) {
        query = query.eq("teacher_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as TimetableEntry[]) ?? [];
    },
  });

  const entriesByDay = useMemo(() => {
    const map = new Map<number, TimetableEntry[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    
    for (const entry of timetableQuery.data ?? []) {
      const arr = map.get(entry.weekday) ?? [];
      arr.push(entry);
      map.set(entry.weekday, arr);
    }
    
    // Sort by period
    map.forEach((entries) => entries.sort((a, b) => a.period - b.period));
    
    return map;
  }, [timetableQuery.data]);

  const hasAnyEntries = (timetableQuery.data?.length ?? 0) > 0;
  const isTeacher = activeRole === "teacher" || activeRole === "homeroom_teacher" || activeRole === "director";

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />

      <main className={cn("w-full min-w-0 transition-all duration-300 will-change-transform pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64")}>
        <header className="w-full h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Orar
            </h1>
            <p className="text-sm text-muted-foreground">{WEEKDAYS[adjustedToday]} • {displayName}</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
              {displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
          {/* Controls */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filtre</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {isTeacher && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Vizualizare:</span>
                  <Select value={viewMode} onValueChange={(v) => setViewMode(v as "class" | "teacher")}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="class">Pe clasă</SelectItem>
                      <SelectItem value="teacher">Orarul meu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {viewMode === "class" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Clasă:</span>
                  <Select
                    value={selectedClassId || undefined}
                    onValueChange={setSelectedClassId}
                    disabled={classesQuery.isLoading || (classesQuery.data?.length ?? 0) === 0}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={classesQuery.isLoading ? "Se încarcă..." : (classesQuery.data?.length ?? 0) === 0 ? "Nu există clase" : "Selectează clasa"} />
                    </SelectTrigger>
                    <SelectContent>
                      {classesQuery.data?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.year && c.section ? `(${c.year}${c.section})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Empty State */}
          {!hasAnyEntries && !timetableQuery.isLoading && (
            <Alert className="border-amber-300/60 bg-amber-50/30 dark:bg-amber-500/10">
              <CalendarX2 className="h-4 w-4" />
              <div>
                <AlertTitle>Orarul nu este disponibil</AlertTitle>
                <AlertDescription>
                  Nu există încă ore introduse în orar{viewMode === "class" && selectedClassId ? " pentru această clasă" : " pentru tine"}. 
                  Contactează secretariatul sau directorul pentru configurare.
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Loading State */}
          {timetableQuery.isLoading && (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" className="text-primary" />
            </div>
          )}

          {/* Schedule Grid */}
          {hasAnyEntries && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              {[0, 1, 2, 3, 4].map((dayIndex) => {
                const dayEntries = entriesByDay.get(dayIndex) ?? [];
                const isToday = dayIndex === adjustedToday;
                
                return (
                  <Card key={dayIndex} className={cn(isToday && "ring-2 ring-primary")}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        {WEEKDAYS[dayIndex]}
                        {isToday && <Badge variant="default" className="text-xs">Azi</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {dayEntries.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nicio oră</p>
                      ) : (
                        dayEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="p-2 rounded-lg bg-secondary/50 border border-border text-xs"
                          >
                            <div className="font-medium">{entry.subjects?.name ?? "Materie"}</div>
                            <div className="text-muted-foreground flex items-center gap-2 mt-1">
                              <span>Ora {entry.period}</span>
                              {entry.start_time && entry.end_time && (
                                <span>• {entry.start_time}-{entry.end_time}</span>
                              )}
                            </div>
                            {entry.room && (
                              <div className="text-muted-foreground mt-0.5">Sala: {entry.room}</div>
                            )}
                            {viewMode === "teacher" && entry.classes?.name && (
                              <div className="text-muted-foreground mt-0.5">Clasa: {entry.classes.name}</div>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
