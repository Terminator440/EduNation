import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk, getCurrentUserSchoolId } from "@/lib/supabase-helpers";
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

export type GradeInsert = {
  student_id: string;
  subject_id: string;
  grade: number;
  date?: string;
  description?: string | null;
};

export type GradeUpdate = {
  grade?: number;
  date?: string;
  description?: string | null;
};

/**
 * Validate grade value: must be integer between 1 and 10
 */
export function validateGrade(grade: number): boolean {
  return Number.isInteger(grade) && grade >= 1 && grade <= 10;
}

/**
 * Check if current user is assigned as teacher to the subject (source of truth: teacher_assignments, fallback: subjects.teacher_id).
 */
export async function verifyTeacherAssignment(
  subjectId: string,
  studentId?: string
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const schoolId = await getCurrentUserSchoolId();
    if (!schoolId) return false;

    if (studentId) {
      const { data: student } = await supabase
        .from("students")
        .select("class_id")
        .eq("id", studentId)
        .maybeSingle();
      if (student?.class_id) {
        const { data: assignment } = await supabase
          .from("teacher_assignments")
          .select("id")
          .eq("teacher_id", user.id)
          .eq("subject_id", subjectId)
          .eq("class_id", student.class_id)
          .eq("school_id", schoolId)
          .maybeSingle();
        if (assignment) return true;
      }
    }

    const { data: assignment } = await supabase
      .from("teacher_assignments")
      .select("id")
      .eq("teacher_id", user.id)
      .eq("subject_id", subjectId)
      .eq("school_id", schoolId)
      .limit(1)
      .maybeSingle();
    if (assignment) return true;

    const { data: subject } = await supabase
      .from("subjects")
      .select("teacher_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (subject?.teacher_id === user.id) return true;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active_role, can_override_grades")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile?.role ?? profile?.active_role)?.toString?.() ?? "";
    if (
      (role === "director" || role === "secretariat") &&
      (profile as { can_override_grades?: boolean } | null)?.can_override_grades === true
    ) {
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error verifying teacher assignment:", error);
    return false;
  }
}

export async function fetchGradesForStudents(
  studentIds: string[],
  schoolId?: string | null
): Promise<GradeRow[]> {
  if (studentIds.length === 0) return [];
  
  const currentSchoolId = schoolId ?? await getCurrentUserSchoolId();
  let query = supabase
    .from("grades")
    .select(
      "id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)"
    )
    .in("student_id", studentIds)
    .is("deleted_at", null)
    .order("date", { ascending: false });
  
  if (currentSchoolId) {
    query = query.eq("school_id", currentSchoolId);
  }
  
  const res = await query;
  return assertSupabaseOk(res, "grades.select");
}

/**
 * Încarcă mediile pe materii pentru elevii dați (din view-ul v_student_subject_averages).
 * Utilizat pentru afișarea situației școlare pe materii.
 */
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

/**
 * Încarcă mediile generale per elev (din view-ul v_student_general_averages).
 * Returnează un obiect { student_id: medie_generala }.
 */
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

/**
 * Add a new grade via RPC (server-side validation, teacher assignment, semester lock).
 * No direct table writes from frontend.
 */
export async function addGrade(gradeData: GradeInsert): Promise<GradeRow> {
  if (!validateGrade(gradeData.grade)) {
    throw new Error("Nota trebuie să fie un număr întreg între 1 și 10");
  }

  const dateStr = gradeData.date ?? new Date().toISOString().split("T")[0];
  const { data: rpcData, error } = await supabase.rpc("add_grade", {
    p_student_id: gradeData.student_id,
    p_subject_id: gradeData.subject_id,
    p_value: gradeData.grade,
    p_type: "oral",
    p_date: dateStr,
    p_description: gradeData.description ?? null,
  });

  if (error) {
    handleServiceError(error, "Adăugare notă");
    throw error;
  }

  const result = rpcData as { success: boolean; error?: string; id?: string } | null;
  if (!result?.success) {
    throw new Error(result?.error ?? "Adăugare notă eșuată");
  }

  const gradeId = result.id;
  if (!gradeId) {
    throw new Error("Adăugare notă: lipsește id");
  }

  const { data: row, error: fetchError } = await supabase
    .from("grades")
    .select("id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)")
    .eq("id", gradeId)
    .single();

  if (fetchError || !row) {
    return {
      id: gradeId,
      date: dateStr,
      grade: gradeData.grade,
      description: gradeData.description ?? null,
      student_id: gradeData.student_id,
      subject: null,
    } as GradeRow;
  }
  return row as GradeRow;
}

/**
 * Update an existing grade value via RPC (permission and semester lock checked server-side).
 * Only grade value is updated; date/description require separate RPC if needed.
 */
export async function updateGrade(
  gradeId: string,
  updates: GradeUpdate
): Promise<GradeRow> {
  if (updates.grade !== undefined && !validateGrade(updates.grade)) {
    throw new Error("Nota trebuie să fie un număr întreg între 1 și 10");
  }

  const newValue = updates.grade;
  if (newValue === undefined) {
    const { data: row } = await supabase
      .from("grades")
    .select("id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)")
      .eq("id", gradeId)
      .is("deleted_at", null)
      .single();
    if (!row) throw new Error("Nota nu a fost găsită");
    return row as GradeRow;
  }

  const { data: rpcData, error } = await supabase.rpc("update_grade", {
    p_grade_id: gradeId,
    p_new_value: newValue,
  });

  if (error) {
    handleServiceError(error, "Actualizare notă");
    throw error;
  }

  const result = rpcData as { success: boolean; error?: string } | null;
  if (!result?.success) {
    throw new Error(result?.error ?? "Actualizare notă eșuată");
  }

  const { data: row, error: fetchError } = await supabase
    .from("grades")
    .select("id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)")
    .eq("id", gradeId)
    .single();

  if (fetchError || !row) {
    throw new Error("Actualizare notă: nu s-a putut reîncărca nota");
  }
  return row as GradeRow;
}

/**
 * Delete a grade (soft delete) via RPC. Permission and semester lock checked server-side.
 */
export async function deleteGrade(gradeId: string): Promise<void> {
  const { data: rpcData, error } = await supabase.rpc("delete_grade", {
    p_grade_id: gradeId,
  });

  if (error) {
    handleServiceError(error, "Ștergere notă");
    throw error;
  }

  const result = rpcData as { success: boolean; error?: string } | null;
  if (!result?.success) {
    throw new Error(result?.error ?? "Ștergere notă eșuată");
  }
}
