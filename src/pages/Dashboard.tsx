import { useMemo } from "react";
import { Calendar, TrendingUp, GraduationCap, UserCircle } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import GradesTable from "@/components/dashboard/GradesTable";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import QuickActions from "@/components/dashboard/QuickActions";
import StatusBanners from "@/components/dashboard/StatusBanners";
import { useAuth } from "@/hooks/useAuth";
import { useGradesForScope, useStudentScope, useAttendanceForScope } from "@/features/academics/queries";
import { useQuery } from "@tanstack/react-query";

const Dashboard = () => {
  const { user, profile, activeRole } = useAuth();
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Utilizator";

  const scopeQuery = useStudentScope(activeRole, user?.id ?? null);
  const gradesQuery = useGradesForScope(scopeQuery.data?.studentIds ?? []);
  const attendanceQuery = useAttendanceForScope(scopeQuery.data?.studentIds ?? []);

  type SchoolEvent = {
    id: string;
    title: string;
    event_date: string;
    event_time?: string;
    type: string;
    subject?: string;
  };
  const eventsQuery = useQuery({
    queryKey: ["school-events-upcoming"],
    queryFn: async (): Promise<SchoolEvent[]> => [],
  });

  const gradesBySubject = useMemo(() => {
    const rows = gradesQuery.data ?? [];
    const map = new Map<string, { subject: string; grades: number[]; average: number; teacher: string }>();
    for (const r of rows) {
      const subjectName = r.subject?.name ?? "Materie necunoscută";
      const entry = map.get(subjectName) ?? { subject: subjectName, grades: [], average: 0, teacher: "—" };
      entry.grades.push(r.grade);
      map.set(subjectName, entry);
    }
    return Array.from(map.values())
      .map((s) => ({ ...s, average: s.grades.length ? s.grades.reduce((a, b) => a + b, 0) / s.grades.length : 0 }))
      .sort((a, b) => a.subject.localeCompare(b.subject, "ro"));
  }, [gradesQuery.data]);

  const generalAverage = useMemo(() => {
    if (gradesBySubject.length === 0) return 0;
    return gradesBySubject.reduce((sum, g) => sum + g.average, 0) / gradesBySubject.length;
  }, [gradesBySubject]);

  const totalGrades = useMemo(() => (gradesQuery.data ?? []).length, [gradesQuery.data]);

  const absenceStats = useMemo(() => {
    const rows = attendanceQuery.data ?? [];
    const abs = rows.filter((r) => ["unexcused", "pending"].includes(r.status)).length;
    const total = rows.length;
    const present = rows.filter((r) => r.status === "present").length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { absences: abs, pct };
  }, [attendanceQuery.data]);

  const upcomingEvents = useMemo(() => {
    return (eventsQuery.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      date: r.event_date,
      time: r.event_time ?? undefined,
      type: r.type,
      subject: r.subject ?? undefined,
    }));
  }, [eventsQuery.data]);

  return (
    <DashboardLayout title={`Bună, ${displayName}!`} subtitle="Panoul tău de elev">
      <StatusBanners />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard title="Media Generală" value={gradesBySubject.length ? generalAverage.toFixed(2) : "—"} subtitle="Din notele înregistrate" icon={TrendingUp} variant="primary" />
        <StatsCard title="Note totale" value={String(totalGrades)} subtitle="În catalog" icon={GraduationCap} variant="success" />
        <StatsCard title="Prezență" value={absenceStats.pct ? `${absenceStats.pct}%` : "—"} subtitle={`${absenceStats.absences} absențe`} icon={UserCircle} variant="accent" />
        <StatsCard title="Evenimente" value={String(upcomingEvents.length)} subtitle="Următoarele zile" icon={Calendar} variant="warning" />
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
    </DashboardLayout>
  );
};

export default Dashboard;
