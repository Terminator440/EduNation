import { useMemo, useState } from "react";
import { Calendar, GraduationCap, TrendingUp, UserCircle } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import GradesTable from "@/components/dashboard/GradesTable";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import StatusBanners from "@/components/dashboard/StatusBanners";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useGradesForScope, useAttendanceForScope } from "@/features/academics/queries";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";

type Child = {
  id: string;
  full_name: string | null;
  class: { id: string; name: string; year: number; section: string } | null;
};

const ParentDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, profile } = useAuth();

  const childrenQuery = useQuery({
    queryKey: ['parent-children', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Child[]> => {
      const res = await supabase
        .from('parent_student_relations')
        .select('student:students(id,full_name, class:classes(id,name,year,section))')
        .eq('parent_user_id', user!.id);
      type ParentStudentRelationRow = {
        student: {
          id: string;
          full_name: string | null;
          class: {
            id: string;
            name: string;
            year: number;
            section: string;
          } | null;
        } | null;
      };
      const rows = assertSupabaseOk(res, 'parent_student_relations.select(children)') as ParentStudentRelationRow[];
      return (rows || []).map(r => r.student).filter((s): s is NonNullable<typeof s> => s !== null);
    },
  });

  const [activeChildId, setActiveChildId] = useState<string | null>(null);

  const children = childrenQuery.data ?? [];
  const effectiveChildId = activeChildId ?? (children[0]?.id ?? null);

  const gradesQuery = useGradesForScope(effectiveChildId ? [effectiveChildId] : []);
  const attendanceQuery = useAttendanceForScope(effectiveChildId ? [effectiveChildId] : []);

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

  const absenceStats = useMemo(() => {
    const rows = attendanceQuery.data ?? [];
    const abs = rows.filter(r => ['unexcused', 'pending'].includes(r.status)).length;
    const total = rows.length;
    const present = rows.filter(r => r.status === 'present').length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { absences: abs, pct };
  }, [attendanceQuery.data]);

  // Stub: school_events table doesn't exist yet
  type SchoolEvent = {
    id: string;
    title: string;
    event_date: string;
    event_time?: string;
    type: string;
  };
  const eventsQuery = useQuery({
    queryKey: ['school-events-upcoming-parent'],
    queryFn: async (): Promise<SchoolEvent[]> => {
      return [];
    },
  });

  const upcomingEvents = useMemo(() => {
    const rows = eventsQuery.data ?? [];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      date: r.event_date,
      time: r.event_time ?? undefined,
      type: r.type,
      subject: r.subject ?? undefined,
    }));
  }, [eventsQuery.data]);

  const activeChild = children.find(c => c.id === effectiveChildId) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <main className={cn("transition-all duration-300", sidebarCollapsed ? "ml-20" : "ml-64")}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Panou Părinte</h1>
            <p className="text-sm text-muted-foreground">
              {activeChild?.full_name ?? '—'}
              {activeChild?.class ? ` • ${activeChild.class.name}` : ''}
            </p>
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
          <StatusBanners />
          <div className="mb-6 flex flex-wrap gap-2">
            {(childrenQuery.data ?? []).map(child => (
              <button
                key={child.id}
                onClick={() => setActiveChildId(child.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  (effectiveChildId === child.id) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {child.full_name ?? 'Elev'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard title="Media" value={gradesBySubject.length ? generalAverage.toFixed(2) : "—"} subtitle="Din catalog" icon={TrendingUp} variant="primary" />
            <StatsCard title="Note" value={String((gradesQuery.data ?? []).length)} subtitle="Total" icon={GraduationCap} variant="success" />
            <StatsCard title="Prezență" value={absenceStats.pct ? `${absenceStats.pct}%` : "—"} subtitle={`${absenceStats.absences} absențe`} icon={UserCircle} variant="accent" />
            <StatsCard title="Evenimente" value={String(upcomingEvents.length)} subtitle="Următoarele zile" icon={Calendar} variant="warning" />
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <GradesTable grades={gradesBySubject} />
            </div>
            <div className="space-y-6">
              <UpcomingEvents events={upcomingEvents} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ParentDashboard;
