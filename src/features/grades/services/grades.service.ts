import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";
import { handleServiceError } from "@/lib/error-handler";

export type GradeRow = {
  id: string;
  date: string;
  grade: number;
  description: string | null;
  student_id: string;
  subject: { id: string; name: string; teacher_id: string | null } | null;
};

export type SubjectAverageRow = {
  student_id: string;
  subject_id: string;
  subject_name: string;
  average: number;
  grade_count: number;
};

export async function fetchGradesForStudents(
  studentIds: string[]
): Promise<GradeRow[]> {
  if (studentIds.length === 0) return [];
  const res = await supabase
    .from("grades")
    .select(
      "id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)"
    )
    .in("student_id", studentIds)
    .order("date", { ascending: false });
  return assertSupabaseOk(res, "grades.select");
}

export async function fetchSubjectAverages(
  studentIds: string[]
): Promise<SubjectAverageRow[]> {
  if (studentIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("v_student_subject_averages")
      .select("student_id, subject_id, subject_name, average, grade_count")
      .in("student_id", studentIds);
    if (error) {
      handleServiceError(error, "Încărcare medii pe materii");
      throw error;
    }
    return (data ?? [])
      .filter((r): r is { student_id: string; subject_id: string; subject_name: string | null; average: number | null; grade_count: number | null } => 
        r.student_id !== null && r.subject_id !== null
      )
      .map((r) => ({
        student_id: r.student_id,
        subject_id: r.subject_id,
        subject_name: r.subject_name ?? "",
        average: r.average ?? 0,
        grade_count: r.grade_count ?? 0,
      }));
  } catch (error) {
    handleServiceError(error, "Încărcare medii pe materii");
    throw error;
  }
}

export async function fetchGeneralAverages(
  studentIds: string[]
): Promise<Record<string, number>> {
  if (studentIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("v_student_general_averages")
      .select("student_id, general_average")
      .in("student_id", studentIds);
    if (error) {
      handleServiceError(error, "Încărcare medii generale");
      throw error;
    }
    const results: Record<string, number> = {};
    (data ?? []).forEach((r) => {
      if (r.student_id) results[r.student_id] = r.general_average ?? 0;
    });
    return results;
  } catch (error) {
    handleServiceError(error, "Încărcare medii generale");
    throw error;
  }
}
