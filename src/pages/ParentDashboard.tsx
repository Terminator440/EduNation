import { useMemo, useState, useCallback } from "react";
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
import {
  useGradesForScope,
  useAttendanceForScope,
  useStudentSummary,
} from "@/features/academics/queries";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk, getCurrentUserSchoolId } from "@/lib/supabase-helpers";

type Child = {
  id: string;
  full_name: string | null;
  class: { id: string; name: string; year: number; section: string } | null;
};

const ParentDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const onToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);
  const { user, profile } = useAuth();

  const childrenQuery = useQuery({
    queryKey: ['parent-children', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Child[]> => {
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId) return [];
      
      const res = await supabase
        .from('parent_student_relations')
        .select('student:students!inner(id,full_name,school_id, class:classes(id,name,year,section))')
        .eq('parent_user_id', user!.id)
        .eq('students.school_id', schoolId);
      type ParentStudentRelationRow = {
        student: {
          id: string;
          full_name: string | null;
          school_id: string | null;
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
  const summaryQuery = useStudentSummary(effectiveChildId);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Utilizator';

  const summaryBySubjectName = useMemo(() => {
    const rows = summaryQuery.data ?? [];
    const map = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!r.subject_name) continue;
      map.set(r.subject_name, r);
    }
    return map;
  }, [summaryQuery.data]);

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
      average: (() => {
        const summary = summaryBySubjectName.get(s.subject);
        if (summary) return summary.subject_average;
        return s.grades.length ? s.grades.reduce((a, b) => a + b, 0) / s.grades.length : 0;
      })(),
    }));
    return out.sort((a, b) => a.subject.localeCompare(b.subject, 'ro'));
  }, [gradesQuery.data, summaryBySubjectName]);

  const generalAverage = useMemo(() => {
    const first = summaryQuery.data?.[0];
    return first?.general_average ?? 0;
  }, [summaryQuery.data]);

  const absenceStats = useMemo(() => {
    const summary = summaryQuery.data?.[0];
    const absences = summary?.total_absences ?? 0;
    const rows = attendanceQuery.data ?? [];
    const total = rows.length;
    const present = rows.filter(r => r.status === 'present').length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { absences, pct };
  }, [summaryQuery.data, attendanceQuery.data]);

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
    <div className="min-h-screen w-full bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />

      <main className={cn("w-full min-w-0 transition-all duration-300 will-change-transform pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64")}>
        <header className="w-full h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
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

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
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

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
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
