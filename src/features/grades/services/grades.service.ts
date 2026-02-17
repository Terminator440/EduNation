import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk, getCurrentUserId } from "@/lib/supabase-helpers";
import { handleServiceError, showSuccessMessage } from "@/lib/error-handler";
import type { Database } from "@/integrations/supabase/types";

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

export type GradeInsert = Database["public"]["Tables"]["grades"]["Insert"];
export type GradeUpdate = Database["public"]["Tables"]["grades"]["Update"];

/**
 * Validates that a grade is between 1 and 10 and is an integer.
 * @throws Error if validation fails
 */
export function validateGrade(value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error("Nota trebuie să fie un număr întreg.");
  }
  if (value < 1 || value > 10) {
    throw new Error("Nota trebuie să fie între 1 și 10.");
  }
}

/**
 * Verifies that the current user is authorized to modify grades for the given subject.
 * Checks if currentUser.id matches teacher_id in the subjects table.
 * @throws Error if user is not authorized
 */
async function verifyTeacherSubjectAccess(subjectId: string): Promise<void> {
  const userId = await getCurrentUserId();

  const { data: subject, error } = await supabase
    .from("subjects")
    .select("id, teacher_id, name")
    .eq("id", subjectId)
    .maybeSingle();

  if (error) {
    handleServiceError(error, "Verificare permisiuni materie");
    throw new Error("Nu s-a putut verifica permisiunea pentru această materie.");
  }

  if (!subject) {
    throw new Error("Materia nu există.");
  }

  if (subject.teacher_id !== userId) {
    throw new Error(
      `Nu ai permisiunea să modifici note pentru materia "${subject.name}". Doar profesorul asignat poate modifica notele.`
    );
  }
}

/**
 * Logs an audit action for grade operations.
 * This is a service-level function that doesn't depend on React hooks.
 */
async function logGradeAudit(
  action: "grade.create" | "grade.update" | "grade.delete",
  gradeId: string,
  oldData?: Record<string, unknown>,
  newData?: Record<string, unknown>,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const userId = await getCurrentUserId();

    // Fetch user profile for audit log
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, active_role, school_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      console.warn("[GradeAudit] Nu s-a putut obține profilul utilizatorului");
      return;
    }

    await supabase.rpc("log_audit_extended", {
      _user_id: userId,
      _user_name: profile.full_name || profile.email || "Unknown",
      _active_role: (profile.active_role as Database["public"]["Enums"]["app_role"]) || "teacher",
      _action: action,
      _entity_type: "grade",
      _entity_id: gradeId,
      _old_data: oldData ? JSON.stringify(oldData) : null,
      _new_data: newData ? JSON.stringify(newData) : null,
      _school_id: profile.school_id ?? null,
      _details: details ? JSON.stringify(details) : null,
    });
  } catch (err) {
    // Don't throw - audit logging failures shouldn't break the main operation
    console.error("[GradeAudit] Eroare la logare audit:", err);
  }
}

/**
 * Adds a new grade for a student.
 * Validates the grade value and verifies teacher authorization.
 */
export async function addGrade(
  studentId: string,
  subjectId: string,
  grade: number,
  options?: {
    date?: string;
    description?: string | null;
    schoolYearId?: string | null;
  }
): Promise<GradeRow> {
  try {
    // Validate grade
    validateGrade(grade);

    // Verify teacher has access to this subject
    await verifyTeacherSubjectAccess(subjectId);

    // Get current user ID
    const userId = await getCurrentUserId();

    // Prepare insert payload
    const payload: GradeInsert = {
      student_id: studentId,
      subject_id: subjectId,
      grade,
      teacher_id: userId,
      date: options?.date || new Date().toISOString().split("T")[0],
      description: options?.description ?? null,
      school_year_id: options?.schoolYearId ?? null,
    };

    // Insert grade
    const res = await supabase.from("grades").insert(payload).select().single();
    const insertedGrade = assertSupabaseOk(res, "grades.insert");

    // Fetch full grade with subject info for return
    const { data: fullGrade, error: fetchError } = await supabase
      .from("grades")
      .select("id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)")
      .eq("id", insertedGrade.id)
      .single();

    if (fetchError) {
      handleServiceError(fetchError, "Încărcare notă după inserare");
      throw fetchError;
    }

    // Audit log
    await logGradeAudit("grade.create", insertedGrade.id, undefined, {
      student_id: studentId,
      subject_id: subjectId,
      grade,
      date: payload.date,
    });

    showSuccessMessage("Notă adăugată", `Nota ${grade} a fost înregistrată cu succes.`);

    return fullGrade as GradeRow;
  } catch (error) {
    handleServiceError(error, "Adăugare notă");
    throw error;
  }
}

/**
 * Updates an existing grade.
 * Validates the grade value and verifies teacher authorization.
 */
export async function updateGrade(
  gradeId: string,
  updates: {
    grade?: number;
    date?: string;
    description?: string | null;
  }
): Promise<GradeRow> {
  try {
    // Fetch existing grade to verify access and get old data
    const { data: existingGrade, error: fetchError } = await supabase
      .from("grades")
      .select("id, student_id, subject_id, grade, date, description, teacher_id")
      .eq("id", gradeId)
      .single();

    if (fetchError || !existingGrade) {
      throw new Error("Nota nu există sau nu ai permisiunea să o accesezi.");
    }

    // Verify teacher has access to this subject
    await verifyTeacherSubjectAccess(existingGrade.subject_id);

    // Validate new grade value if provided
    if (updates.grade !== undefined) {
      validateGrade(updates.grade);
    }

    // Prepare update payload
    const payload: GradeUpdate = {
      grade: updates.grade,
      date: updates.date,
      description: updates.description,
    };

    // Remove undefined fields
    Object.keys(payload).forEach((key) => {
      if (payload[key as keyof GradeUpdate] === undefined) {
        delete payload[key as keyof GradeUpdate];
      }
    });

    // Update grade
    const res = await supabase.from("grades").update(payload).eq("id", gradeId).select().single();
    const updatedGrade = assertSupabaseOk(res, "grades.update");

    // Fetch full grade with subject info for return
    const { data: fullGrade, error: fullFetchError } = await supabase
      .from("grades")
      .select("id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)")
      .eq("id", gradeId)
      .single();

    if (fullFetchError) {
      handleServiceError(fullFetchError, "Încărcare notă după actualizare");
      throw fullFetchError;
    }

    // Audit log with old and new data
    await logGradeAudit(
      "grade.update",
      gradeId,
      {
        grade: existingGrade.grade,
        date: existingGrade.date,
        description: existingGrade.description,
      },
      {
        grade: updatedGrade.grade,
        date: updatedGrade.date,
        description: updatedGrade.description,
      },
      {
        student_id: existingGrade.student_id,
        subject_id: existingGrade.subject_id,
      }
    );

    showSuccessMessage("Notă actualizată", "Nota a fost modificată cu succes.");

    return fullGrade as GradeRow;
  } catch (error) {
    handleServiceError(error, "Actualizare notă");
    throw error;
  }
}

/**
 * Deletes a grade (soft delete by setting deleted_at).
 * Verifies teacher authorization before deletion.
 */
export async function deleteGrade(gradeId: string): Promise<void> {
  try {
    // Fetch existing grade to verify access
    const { data: existingGrade, error: fetchError } = await supabase
      .from("grades")
      .select("id, student_id, subject_id, grade, date, description, teacher_id")
      .eq("id", gradeId)
      .single();

    if (fetchError || !existingGrade) {
      throw new Error("Nota nu există sau nu ai permisiunea să o accesezi.");
    }

    // Verify teacher has access to this subject
    await verifyTeacherSubjectAccess(existingGrade.subject_id);

    // Get current user ID for soft delete
    const userId = await getCurrentUserId();

    // Soft delete: Set deleted_at and deleted_by
    // Note: These columns exist in DB (from migration) but may not be in generated types
    const res = await supabase
      .from("grades")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
      } as GradeUpdate & { deleted_at?: string; deleted_by?: string })
      .eq("id", gradeId)
      .select()
      .single();

    assertSupabaseOk(res, "grades.delete");

    // Audit log
    await logGradeAudit(
      "grade.delete",
      gradeId,
      {
        grade: existingGrade.grade,
        date: existingGrade.date,
        description: existingGrade.description,
        student_id: existingGrade.student_id,
        subject_id: existingGrade.subject_id,
      },
      undefined,
      {
        deleted_by: userId,
        deleted_at: new Date().toISOString(),
      }
    );

    showSuccessMessage("Notă ștearsă", "Nota a fost ștearsă cu succes.");
  } catch (error) {
    handleServiceError(error, "Ștergere notă");
    throw error;
  }
}

// Existing query functions remain unchanged
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
    .is("deleted_at", null) // Only fetch non-deleted grades
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
