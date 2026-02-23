/**
 * Grades repository – data access only (no business logic).
 * Services use this layer for Supabase calls; validation and permissions stay in RPC/services.
 */
import { supabase } from "@/integrations/supabase/client";

export type GradeRow = {
  id: string;
  date: string;
  grade: number;
  description: string | null;
  student_id: string;
  subject: { id: string; name: string; teacher_id: string | null } | null;
};

/**
 * Fetch grade rows by grade IDs (for re-fetch after RPC insert/update).
 */
export async function getGradesByIds(
  gradeIds: string[]
): Promise<GradeRow[]> {
  if (gradeIds.length === 0) return [];
  const { data, error } = await supabase
    .from("grades")
    .select("id, date, grade, description, student_id, subject:subjects(id, name, teacher_id)")
    .in("id", gradeIds)
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []) as GradeRow[];
}

/**
 * Fetch one grade by id.
 */
export async function getGradeById(gradeId: string): Promise<GradeRow | null> {
  const { data, error } = await supabase
    .from("grades")
    .select("id, date, grade, description, student_id, subject:subjects(id, name, teacher_id)")
    .eq("id", gradeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as GradeRow | null;
}
