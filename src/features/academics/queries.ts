import { useQuery } from "@tanstack/react-query";
import {
  fetchStudentScope,
  fetchStudentNames,
  type StudentScope,
  type StudentNameRow,
} from "@/features/users/services/users.service";
import {
  fetchGradesForStudents,
  fetchSubjectAverages,
  fetchGeneralAverages,
  type GradeRow,
  type SubjectAverageRow,
} from "@/features/grades/services/grades.service";
import {
  fetchAttendanceForStudents,
  type AttendanceRow,
} from "@/features/attendance/services/attendance.service";
import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";

export type StudentSummaryRow = {
  subject_id: string;
  subject_name: string;
  subject_average: number;
  subject_grade_count: number;
  total_absences: number;
  total_motivated_absences: number;
  total_unmotivated_absences: number;
  general_average: number;
};

// Re-export types for consumers
export type {
  StudentScope,
  StudentNameRow,
  GradeRow,
  SubjectAverageRow,
  AttendanceRow,
  StudentSummaryRow,
};

export const useStudentScope = (activeRole: string | null, userId: string | null) =>
  useQuery({
    queryKey: ["student-scope", activeRole, userId],
    enabled: Boolean(activeRole && userId),
    queryFn: () => fetchStudentScope(activeRole!, userId!),
  });

export const useStudentsForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["students-names", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchStudentNames(studentIds),
  });

export const useGradesForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["grades", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchGradesForStudents(studentIds),
  });

export const useSubjectAveragesForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["subject-averages", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchSubjectAverages(studentIds),
  });

export const useGeneralAveragesForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["general-averages", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchGeneralAverages(studentIds),
  });

export const useAttendanceForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["attendance", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchAttendanceForStudents(studentIds),
  });

// Fetch summary (per-subject averages + global stats) for a single student
export async function fetchStudentSummary(
  studentId: string
): Promise<StudentSummaryRow[]> {
  if (!studentId) return [];
  const res = await supabase.rpc("get_student_summary", {
    p_student_id: studentId,
  });
  return assertSupabaseOk(res, "get_student_summary");
}

export const useStudentSummary = (studentId: string | null) =>
  useQuery({
    queryKey: ["student-summary", studentId],
    enabled: Boolean(studentId),
    queryFn: () => fetchStudentSummary(studentId!),
  });

