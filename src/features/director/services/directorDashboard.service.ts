/**
 * Director dashboard: stats, audit logs, grades distribution.
 * All DB access here; no direct supabase in UI.
 */
import { supabase } from "@/integrations/supabase/client";

export type DirectorStats = {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalGrades: number;
  averageGrade: number;
  totalAbsences: number;
  activeUsers: number;
};

export type GradeDistRow = { grade: number; cnt: number };

export type AuditLogRow = {
  id: string;
  user_name: string | null;
  active_role: string | null;
  action: string;
  entity_type: string | null;
  created_at: string;
};

export async function fetchDirectorStats(schoolId: string): Promise<{
  stats: DirectorStats;
  gradesDistribution: GradeDistRow[];
  auditLogs: AuditLogRow[];
}> {
  const [
    { count: studentsCount },
    { count: classesCount },
    { count: teachersCount },
    { data: gradesStatsData },
    { data: gradesDistData },
    { count: absencesCount },
    { count: activeUsersCount },
    { data: logsData },
  ] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("classes").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .in("role", ["teacher", "homeroom_teacher"]),
    supabase.rpc("get_school_grades_stats"),
    supabase.rpc("get_grades_distribution"),
    supabase
      .from("attendance")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .in("status", ["unexcused", "pending"]),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase
      .from("audit_logs")
      .select("id, user_name, active_role, action, entity_type, created_at")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const gradesStats = Array.isArray(gradesStatsData) && gradesStatsData.length > 0
    ? (gradesStatsData[0] as { total_count: number | null; average_grade: number | null })
    : null;
  const totalGrades = Number(gradesStats?.total_count ?? 0);
  const avgGrade = gradesStats?.average_grade != null ? Number(gradesStats.average_grade) : 0;

  const stats: DirectorStats = {
    totalStudents: studentsCount ?? 0,
    totalTeachers: teachersCount ?? 0,
    totalClasses: classesCount ?? 0,
    totalGrades,
    averageGrade: avgGrade,
    totalAbsences: absencesCount ?? 0,
    activeUsers: activeUsersCount ?? 0,
  };

  const gradesDistribution = (gradesDistData ?? []) as GradeDistRow[];
  const auditLogs = (logsData ?? []) as AuditLogRow[];

  return { stats, gradesDistribution, auditLogs };
}
