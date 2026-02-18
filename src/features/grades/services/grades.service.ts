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
 * Check if current user is assigned as teacher to the subject
 */
export async function verifyTeacherAssignment(subjectId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: subject } = await supabase
      .from("subjects")
      .select("teacher_id")
      .eq("id", subjectId)
      .maybeSingle();

    return subject?.teacher_id === user.id;
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

/**
 * Add a new grade with validation and teacher assignment check
 */
export async function addGrade(gradeData: GradeInsert): Promise<GradeRow> {
  // Validate grade value
  if (!validateGrade(gradeData.grade)) {
    throw new Error("Nota trebuie să fie un număr întreg între 1 și 10");
  }

  // Verify teacher assignment
  const isAssigned = await verifyTeacherAssignment(gradeData.subject_id);
  if (!isAssigned) {
    throw new Error("Nu sunteți asignat la această materie");
  }

  // Get current user and school_id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Utilizator neautentificat");
  }

  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  // Get student's school_id to ensure consistency
  const { data: student } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", gradeData.student_id)
    .maybeSingle();

  if (!student || student.school_id !== schoolId) {
    throw new Error("Elevul nu aparține aceleiași școli");
  }

  const { data, error } = await supabase
    .from("grades")
    .insert({
      student_id: gradeData.student_id,
      subject_id: gradeData.subject_id,
      grade: gradeData.grade,
      date: gradeData.date || new Date().toISOString().split('T')[0],
      description: gradeData.description || null,
      teacher_id: user.id,
      school_id: schoolId,
    })
    .select("id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)")
    .single();

  if (error) {
    handleServiceError(error, "Adăugare notă");
    throw error;
  }

  return data as GradeRow;
}

/**
 * Update an existing grade with validation
 */
export async function updateGrade(
  gradeId: string,
  updates: GradeUpdate
): Promise<GradeRow> {
  // Validate grade value if provided
  if (updates.grade !== undefined && !validateGrade(updates.grade)) {
    throw new Error("Nota trebuie să fie un număr întreg între 1 și 10");
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Utilizator neautentificat");
  }

  // Verify the grade exists and belongs to current user's school
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  const { data: existingGrade } = await supabase
    .from("grades")
    .select("subject_id, school_id")
    .eq("id", gradeId)
    .maybeSingle();

  if (!existingGrade) {
    throw new Error("Nota nu a fost găsită");
  }

  if (existingGrade.school_id !== schoolId) {
    throw new Error("Nota nu aparține școlii dvs.");
  }

  // Verify teacher assignment if updating grade value
  if (updates.grade !== undefined) {
    const isAssigned = await verifyTeacherAssignment(existingGrade.subject_id);
    if (!isAssigned) {
      throw new Error("Nu sunteți asignat la această materie");
    }
  }

  const { data, error } = await supabase
    .from("grades")
    .update({
      ...updates,
      teacher_id: user.id, // Update teacher_id to current user
    })
    .eq("id", gradeId)
    .select("id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)")
    .single();

  if (error) {
    handleServiceError(error, "Actualizare notă");
    throw error;
  }

  return data as GradeRow;
}

/**
 * Delete a grade (soft delete by setting deleted_at)
 */
export async function deleteGrade(gradeId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Utilizator neautentificat");
  }

  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  // Verify the grade exists and belongs to current user's school
  const { data: existingGrade } = await supabase
    .from("grades")
    .select("subject_id, school_id")
    .eq("id", gradeId)
    .maybeSingle();

  if (!existingGrade) {
    throw new Error("Nota nu a fost găsită");
  }

  if (existingGrade.school_id !== schoolId) {
    throw new Error("Nota nu aparține școlii dvs.");
  }

  // Verify teacher assignment
  const isAssigned = await verifyTeacherAssignment(existingGrade.subject_id);
  if (!isAssigned) {
    throw new Error("Nu sunteți asignat la această materie");
  }

  const { error } = await supabase
    .from("grades")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", gradeId);

  if (error) {
    handleServiceError(error, "Ștergere notă");
    throw error;
  }
}
