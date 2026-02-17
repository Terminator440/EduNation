import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";

export type StudentNameRow = { id: string; full_name: string | null };

export type StudentScope = {
  studentIds: string[];
};

export async function fetchStudentScope(
  activeRole: string,
  userId: string
): Promise<StudentScope> {
  if (activeRole === "student") {
    const res = await supabase
      .from("students")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const row = assertSupabaseOk(res, "students.select(student)");
    return { studentIds: row?.id ? [row.id] : [] };
  }

  if (activeRole === "parent") {
    const res = await supabase
      .from("parent_student_relations")
      .select("student_id")
      .eq("parent_user_id", userId);
    const rows = assertSupabaseOk(res, "parent_student_relations.select(parent)");
    return { studentIds: (rows || []).map((r) => r.student_id) };
  }

  return { studentIds: [] };
}

export async function fetchStudentNames(
  studentIds: string[]
): Promise<StudentNameRow[]> {
  if (studentIds.length === 0) return [];
  const res = await supabase
    .from("students")
    .select("id, full_name")
    .in("id", studentIds);
  return assertSupabaseOk(res, "students.select(names)") ?? [];
}
