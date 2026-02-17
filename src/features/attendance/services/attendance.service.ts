import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk, getCurrentUserId } from "@/lib/supabase-helpers";
import { handleServiceError, showSuccessMessage } from "@/lib/error-handler";
import type { Database } from "@/integrations/supabase/types";

export type AttendanceRow = {
  id: string;
  date: string;
  status: string;
  student_id: string;
  subject_id: string;
  teacher_id: string | null;
  is_excused: boolean;
  reason: string | null;
  subject: { id: string; name: string; teacher_id: string | null } | null;
};

export type AttendanceInsert = Database["public"]["Tables"]["attendance"]["Insert"] & {
  excuse_reason?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type AttendanceUpdate = Database["public"]["Tables"]["attendance"]["Update"] & {
  excuse_reason?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

/**
 * Verifies that the current user is authorized to modify attendance for the given subject.
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
      `Nu ai permisiunea să modifici prezența pentru materia "${subject.name}". Doar profesorul asignat poate modifica prezența.`
    );
  }
}

/**
 * Fetches attendance records for the given students.
 * Filters out soft-deleted records (deleted_at IS NULL).
 */
export async function fetchAttendanceForStudents(
  studentIds: string[]
): Promise<AttendanceRow[]> {
  if (studentIds.length === 0) return [];
  
  const res = await supabase
    .from("attendance")
    .select(`
      id,
      date,
      status,
      student_id,
      subject_id,
      teacher_id,
      motivated_at,
      motivated_by,
      excuse_reason,
      subject:subjects(id,name,teacher_id)
    `)
    .in("student_id", studentIds)
    .is("deleted_at", null)
    .order("date", { ascending: false });
  
  const rows = assertSupabaseOk(res, "attendance.select");
  
  // Map to AttendanceRow with is_excused and reason
  return rows.map((row: {
    id: string;
    date: string;
    status: string;
    student_id: string;
    subject_id: string;
    teacher_id: string | null;
    motivated_at: string | null;
    motivated_by: string | null;
    excuse_reason: string | null;
    subject: { id: string; name: string; teacher_id: string | null } | null;
  }) => ({
    id: row.id,
    date: row.date,
    status: row.status,
    student_id: row.student_id,
    subject_id: row.subject_id,
    teacher_id: row.teacher_id,
    is_excused: Boolean(row.motivated_at || row.motivated_by),
    reason: row.excuse_reason ?? null,
    subject: row.subject,
  }));
}

/**
 * Adds a new attendance record.
 * Validates that the teacher is assigned to the subject.
 * @throws Error if validation fails or insertion fails
 */
export async function addAttendance(
  studentId: string,
  subjectId: string,
  status: string,
  options?: {
    date?: string;
    is_excused?: boolean;
    reason?: string | null;
    schoolYearId?: string | null;
  }
): Promise<AttendanceRow> {
  try {
    await verifyTeacherSubjectAccess(subjectId);
    const userId = await getCurrentUserId();

    const payload: AttendanceInsert = {
      student_id: studentId,
      subject_id: subjectId,
      status,
      teacher_id: userId,
      date: options?.date || new Date().toISOString().split("T")[0],
      school_year_id: options?.schoolYearId ?? null,
    };

    // Set motivated_at and motivated_by if is_excused is true
    if (options?.is_excused) {
      payload.motivated_at = new Date().toISOString();
      payload.motivated_by = userId;
      payload.excuse_reason = options?.reason ?? null;
    }

    const res = await supabase
      .from("attendance")
      .insert(payload)
      .select(`
        id,
        date,
        status,
        student_id,
        subject_id,
        teacher_id,
        motivated_at,
        motivated_by,
        excuse_reason,
        subject:subjects(id,name,teacher_id)
      `)
      .single();

    const insertedAttendance = assertSupabaseOk(res, "attendance.insert");

    // Fetch full attendance with subject relation
    const fullAttendance: AttendanceRow = {
      id: insertedAttendance.id,
      date: insertedAttendance.date,
      status: insertedAttendance.status,
      student_id: insertedAttendance.student_id,
      subject_id: insertedAttendance.subject_id,
      teacher_id: insertedAttendance.teacher_id,
      is_excused: Boolean(insertedAttendance.motivated_at || insertedAttendance.motivated_by),
      reason: insertedAttendance.excuse_reason ?? null,
      subject: insertedAttendance.subject as { id: string; name: string; teacher_id: string | null } | null,
    };

    showSuccessMessage("Prezență înregistrată", `Statusul "${status}" a fost înregistrat cu succes.`);
    return fullAttendance;
  } catch (error) {
    handleServiceError(error, "Înregistrare prezență");
    throw error;
  }
}

/**
 * Updates an existing attendance record.
 * Validates that the teacher is assigned to the subject.
 * @throws Error if validation fails or update fails
 */
export async function updateAttendance(
  attendanceId: string,
  updates: {
    status?: string;
    date?: string;
    is_excused?: boolean;
    reason?: string | null;
  }
): Promise<AttendanceRow> {
  try {
    // First, fetch the attendance to get subject_id
    const { data: existingAttendance, error: fetchError } = await supabase
      .from("attendance")
      .select("subject_id")
      .eq("id", attendanceId)
      .maybeSingle();

    if (fetchError) {
      handleServiceError(fetchError, "Verificare prezență");
      throw new Error("Nu s-a putut găsi înregistrarea de prezență.");
    }

    if (!existingAttendance) {
      throw new Error("Înregistrarea de prezență nu există.");
    }

    await verifyTeacherSubjectAccess(existingAttendance.subject_id);

    const userId = await getCurrentUserId();
    const payload: AttendanceUpdate = {};

    if (updates.status !== undefined) {
      payload.status = updates.status;
    }
    if (updates.date !== undefined) {
      payload.date = updates.date;
    }

    // Handle is_excused and reason
    if (updates.is_excused !== undefined) {
      if (updates.is_excused) {
        payload.motivated_at = new Date().toISOString();
        payload.motivated_by = userId;
        payload.excuse_reason = updates.reason ?? null;
      } else {
        payload.motivated_at = null;
        payload.motivated_by = null;
        payload.excuse_reason = null;
      }
    } else if (updates.reason !== undefined) {
      // Only update reason if is_excused is already true
      payload.excuse_reason = updates.reason;
    }

    const res = await supabase
      .from("attendance")
      .update(payload)
      .eq("id", attendanceId)
      .select(`
        id,
        date,
        status,
        student_id,
        subject_id,
        teacher_id,
        motivated_at,
        motivated_by,
        excuse_reason,
        subject:subjects(id,name,teacher_id)
      `)
      .single();

    const updatedAttendance = assertSupabaseOk(res, "attendance.update");

    const fullAttendance: AttendanceRow = {
      id: updatedAttendance.id,
      date: updatedAttendance.date,
      status: updatedAttendance.status,
      student_id: updatedAttendance.student_id,
      subject_id: updatedAttendance.subject_id,
      teacher_id: updatedAttendance.teacher_id,
      is_excused: Boolean(updatedAttendance.motivated_at || updatedAttendance.motivated_by),
      reason: updatedAttendance.excuse_reason ?? null,
      subject: updatedAttendance.subject as { id: string; name: string; teacher_id: string | null } | null,
    };

    showSuccessMessage("Prezență actualizată", "Înregistrarea de prezență a fost actualizată cu succes.");
    return fullAttendance;
  } catch (error) {
    handleServiceError(error, "Actualizare prezență");
    throw error;
  }
}

/**
 * Deletes an attendance record (soft delete).
 * Validates that the teacher is assigned to the subject.
 * @throws Error if validation fails or deletion fails
 */
export async function deleteAttendance(attendanceId: string): Promise<void> {
  try {
    // First, fetch the attendance to get subject_id
    const { data: existingAttendance, error: fetchError } = await supabase
      .from("attendance")
      .select("subject_id")
      .eq("id", attendanceId)
      .maybeSingle();

    if (fetchError) {
      handleServiceError(fetchError, "Verificare prezență");
      throw new Error("Nu s-a putut găsi înregistrarea de prezență.");
    }

    if (!existingAttendance) {
      throw new Error("Înregistrarea de prezență nu există.");
    }

    await verifyTeacherSubjectAccess(existingAttendance.subject_id);

    const userId = await getCurrentUserId();

    const res = await supabase
      .from("attendance")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
      })
      .eq("id", attendanceId);

    assertSupabaseOk(res, "attendance.delete");

    showSuccessMessage("Prezență ștearsă", "Înregistrarea de prezență a fost ștearsă cu succes.");
  } catch (error) {
    handleServiceError(error, "Ștergere prezență");
    throw error;
  }
}
