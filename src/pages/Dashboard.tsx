import { useMemo, useState } from "react";
import { Calendar, TrendingUp, GraduationCap, UserCircle } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import GradesTable from "@/components/dashboard/GradesTable";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import QuickActions from "@/components/dashboard/QuickActions";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useGradesForScope, useStudentScope, useAttendanceForScope } from "@/features/academics/queries";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";

const Dashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, profile, activeRole } = useAuth();

  // Student dashboard only
  const scopeQuery = useStudentScope(activeRole, user?.id ?? null);
  const gradesQuery = useGradesForScope(scopeQuery.data?.studentIds ?? []);
  const attendanceQuery = useAttendanceForScope(scopeQuery.data?.studentIds ?? []);

  const eventsQuery = useQuery({
    queryKey: ['school-events-upcoming'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await supabase
        .from('school_events')
        .select('id,title,event_date,event_time,type,subject')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(6);
      return assertSupabaseOk(res, 'school_events.select(upcoming)') as any[];
    },
  });

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Utilizator';

  const gradesBySubject = useMemo(() => {
    const rows = gradesQuery.data ?? [];
    const map = new Map<string, { subject: string; grades: number[]; average: number; teacher: string }>();
    for (const r of rows) {
      const subjectName = r.subject?.name ?? 'Materie necunoscută';
      const entry = map.get(subjectName) ?? { subject: subjectName, grades: [], average: 0, teacher: '—' };
      entry.grades.push(r.grade);
      map.set(subjectName, entry);
    }
    const out = Array.from(map.values()).map(s => ({
      ...s,
      average: s.grades.length ? s.grades.reduce((a, b) => a + b, 0) / s.grades.length : 0,
    }));
    return out.sort((a, b) => a.subject.localeCompare(b.subject, 'ro'));
  }, [gradesQuery.data]);

  const generalAverage = useMemo(() => {
    if (gradesBySubject.length === 0) return 0;
    return gradesBySubject.reduce((sum, g) => sum + g.average, 0) / gradesBySubject.length;
  }, [gradesBySubject]);

  const totalGrades = useMemo(() => (gradesQuery.data ?? []).length, [gradesQuery.data]);

  const absenceStats = useMemo(() => {
    const rows = attendanceQuery.data ?? [];
    const abs = rows.filter(r => r.status === 'absent').length;
    const total = rows.length;
    const present = rows.filter(r => r.status === 'prezent').length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { absences: abs, pct };
  }, [attendanceQuery.data]);

  const upcomingEvents = useMemo(() => {
    const rows = (eventsQuery.data ?? []) as any[];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      date: r.event_date,
      time: r.event_time ?? undefined,
      type: r.type,
      subject: r.subject ?? undefined,
    }));
  }, [eventsQuery.data]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <main className={cn("transition-all duration-300", sidebarCollapsed ? "ml-20" : "ml-64")}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Bună, {displayName}!</h1>
            <p className="text-sm text-muted-foreground">Panoul tău de elev</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Media Generală"
              value={gradesBySubject.length ? generalAverage.toFixed(2) : "—"}
              subtitle="Din notele înregistrate"
              icon={TrendingUp}
              variant="primary"
            />
            <StatsCard
              title="Note totale"
              value={String(totalGrades)}
              subtitle="În catalog"
              icon={GraduationCap}
              variant="success"
            />
            <StatsCard
              title="Prezență"
              value={absenceStats.pct ? `${absenceStats.pct}%` : "—"}
              subtitle={`${absenceStats.absences} absențe`}
              icon={UserCircle}
              variant="accent"
            />
            <StatsCard
              title="Evenimente"
              value={String(upcomingEvents.length)}
              subtitle="Următoarele zile"
              icon={Calendar}
              variant="warning"
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <GradesTable grades={gradesBySubject} />
            </div>
            <div className="space-y-6">
              <UpcomingEvents events={upcomingEvents} />
              <QuickActions />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
