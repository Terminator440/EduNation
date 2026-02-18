import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk, getCurrentUserSchoolId } from "@/lib/supabase-helpers";

export type StudentNameRow = { id: string; full_name: string | null };

export type StudentScope = {
  studentIds: string[];
};

export async function fetchStudentScope(
  activeRole: string,
  userId: string
): Promise<StudentScope> {
  const schoolId = await getCurrentUserSchoolId();
  
  if (activeRole === "student") {
    const res = await supabase
      .from("students")
      .select("id")
      .eq("user_id", userId)
      .eq("school_id", schoolId ?? "")
      .limit(1)
      .maybeSingle();
    const row = assertSupabaseOk(res, "students.select(student)");
    return { studentIds: row && row.id ? [row.id] : [] };
  }

  if (activeRole === "parent") {
    // Filter by school_id through students table
    const res = await supabase
      .from("parent_student_relations")
      .select("student_id, students!inner(school_id)")
      .eq("parent_user_id", userId)
      .eq("students.school_id", schoolId ?? "");
    const rows = assertSupabaseOk(res, "parent_student_relations.select(parent)");
    return { 
      studentIds: (rows || [])
        .map((r) => r.student_id)
        .filter((id): id is string => id !== null && id !== undefined)
    };
  }

  return { studentIds: [] };
}

export async function fetchStudentNames(
  studentIds: string[]
): Promise<StudentNameRow[]> {
  if (studentIds.length === 0) return [];
  const schoolId = await getCurrentUserSchoolId();
  const res = await supabase
    .from("students")
    .select("id, full_name")
    .in("id", studentIds)
    .eq("school_id", schoolId ?? "");
  return assertSupabaseOk(res, "students.select(names)") ?? [];
}
