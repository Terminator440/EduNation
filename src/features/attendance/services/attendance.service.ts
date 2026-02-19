import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk, getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { handleServiceError } from "@/lib/error-handler";

export type AttendanceRow = {
  id: string;
  date: string;
  status: string;
  student_id: string;
  is_excused?: boolean;
  subject: { id: string; name: string; teacher_id: string | null } | null;
};

export type AttendanceInsert = {
  student_id: string;
  subject_id: string;
  date?: string;
  status: string;
  is_excused?: boolean;
};

export type AttendanceUpdate = {
  status?: string;
  is_excused?: boolean;
  date?: string;
};

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

export async function fetchAttendanceForStudents(
  studentIds: string[],
  schoolId?: string | null
): Promise<AttendanceRow[]> {
  if (studentIds.length === 0) return [];
  
  const currentSchoolId = schoolId ?? await getCurrentUserSchoolId();
  let query = supabase
    .from("attendance")
    .select("id,date,status,student_id,is_excused, subject:subjects(id,name,teacher_id)")
    .in("student_id", studentIds)
    .is("deleted_at", null)
    .order("date", { ascending: false });
  
  if (currentSchoolId) {
    query = query.eq("school_id", currentSchoolId);
  }
  
  const res = await query;
  return assertSupabaseOk(res, "attendance.select");
}

/**
 * Add or update attendance for a student/subject/date via RPC (mark_attendance upsert).
 * Server validates teacher assignment and school. No direct table writes.
 */
export async function addAttendance(attendanceData: AttendanceInsert): Promise<AttendanceRow> {
  const dateStr = attendanceData.date ?? new Date().toISOString().split("T")[0];
  const { data: rpcData, error } = await supabase.rpc("mark_attendance", {
    p_student_id: attendanceData.student_id,
    p_subject_id: attendanceData.subject_id,
    p_date: dateStr,
    p_status: attendanceData.status,
    p_is_excused: attendanceData.is_excused ?? false,
  });

  if (error) {
    handleServiceError(error, "Adăugare absență");
    throw error;
  }

  const result = rpcData as { success: boolean; error?: string; id?: string } | null;
  if (!result?.success) {
    throw new Error(result?.error ?? "Adăugare absență eșuată");
  }

  const id = result.id;
  if (id) {
    const { data: row } = await supabase
      .from("attendance")
      .select("id,date,status,student_id,is_excused, subject:subjects(id,name,teacher_id)")
      .eq("id", id)
      .single();
    if (row) return row as AttendanceRow;
  }

  return {
    id: id ?? "",
    date: dateStr,
    status: attendanceData.status,
    student_id: attendanceData.student_id,
    is_excused: attendanceData.is_excused ?? false,
    subject: null,
  } as AttendanceRow;
}

/**
 * Update attendance via RPC: load existing row (read-only), then mark_attendance for same date with new status.
 */
export async function updateAttendance(
  attendanceId: string,
  updates: AttendanceUpdate
): Promise<AttendanceRow> {
  const { data: existing } = await supabase
    .from("attendance")
    .select("student_id, subject_id, date, status, is_excused")
    .eq("id", attendanceId)
    .is("deleted_at", null)
    .single();

  if (!existing?.student_id || !existing?.subject_id || !existing?.date) {
    throw new Error("Absența nu a fost găsită");
  }

  const status = updates.status ?? existing.status ?? "absent";
  const isExcused = updates.is_excused ?? existing.is_excused ?? false;
  const dateStr = updates.date ?? existing.date;

  const { data: rpcData, error } = await supabase.rpc("mark_attendance", {
    p_student_id: existing.student_id,
    p_subject_id: existing.subject_id,
    p_date: dateStr,
    p_status: status,
    p_is_excused: isExcused,
  });

  if (error) {
    handleServiceError(error, "Actualizare absență");
    throw error;
  }

  const result = rpcData as { success: boolean; error?: string; id?: string } | null;
  if (!result?.success) {
    throw new Error(result?.error ?? "Actualizare absență eșuată");
  }

  const id = result.id ?? attendanceId;
  const { data: row } = await supabase
    .from("attendance")
    .select("id,date,status,student_id,is_excused, subject:subjects(id,name,teacher_id)")
    .eq("id", id)
    .single();

  if (row) return row as AttendanceRow;
  return {
    id,
    date: dateStr,
    status,
    student_id: existing.student_id,
    is_excused: isExcused,
    subject: null,
  } as AttendanceRow;
}

/**
 * Delete attendance (soft delete) via RPC. Permission checked server-side.
 */
export async function deleteAttendance(attendanceId: string): Promise<void> {
  const { data: rpcData, error } = await supabase.rpc("delete_attendance", {
    p_attendance_id: attendanceId,
  });

  if (error) {
    handleServiceError(error, "Ștergere absență");
    throw error;
  }

  const result = rpcData as { success: boolean; error?: string } | null;
  if (!result?.success) {
    throw new Error(result?.error ?? "Ștergere absență eșuată");
  }
}
