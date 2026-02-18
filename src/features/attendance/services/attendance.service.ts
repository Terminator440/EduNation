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
 * Add a new attendance record with teacher assignment check
 */
export async function addAttendance(attendanceData: AttendanceInsert): Promise<AttendanceRow> {
  // Verify teacher assignment
  const isAssigned = await verifyTeacherAssignment(attendanceData.subject_id);
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
    .eq("id", attendanceData.student_id)
    .maybeSingle();

  if (!student || student.school_id !== schoolId) {
    throw new Error("Elevul nu aparține aceleiași școli");
  }

  const { data, error } = await supabase
    .from("attendance")
    .insert({
      student_id: attendanceData.student_id,
      subject_id: attendanceData.subject_id,
      date: attendanceData.date || new Date().toISOString().split('T')[0],
      status: attendanceData.status,
      is_excused: attendanceData.is_excused ?? false,
      teacher_id: user.id,
      school_id: schoolId,
    })
    .select("id,date,status,student_id,is_excused, subject:subjects(id,name,teacher_id)")
    .single();

  if (error) {
    handleServiceError(error, "Adăugare absență");
    throw error;
  }

  return data as AttendanceRow;
}

/**
 * Update an existing attendance record
 */
export async function updateAttendance(
  attendanceId: string,
  updates: AttendanceUpdate
): Promise<AttendanceRow> {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Utilizator neautentificat");
  }

  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  // Verify the attendance exists and belongs to current user's school
  const { data: existingAttendance } = await supabase
    .from("attendance")
    .select("subject_id, school_id")
    .eq("id", attendanceId)
    .maybeSingle();

  if (!existingAttendance) {
    throw new Error("Absența nu a fost găsită");
  }

  if (existingAttendance.school_id !== schoolId) {
    throw new Error("Absența nu aparține școlii dvs.");
  }

  // Verify teacher assignment
  const isAssigned = await verifyTeacherAssignment(existingAttendance.subject_id);
  if (!isAssigned) {
    throw new Error("Nu sunteți asignat la această materie");
  }

  const { data, error } = await supabase
    .from("attendance")
    .update({
      ...updates,
      teacher_id: user.id, // Update teacher_id to current user
    })
    .eq("id", attendanceId)
    .select("id,date,status,student_id,is_excused, subject:subjects(id,name,teacher_id)")
    .single();

  if (error) {
    handleServiceError(error, "Actualizare absență");
    throw error;
  }

  return data as AttendanceRow;
}

/**
 * Delete an attendance record (soft delete by setting deleted_at)
 */
export async function deleteAttendance(attendanceId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Utilizator neautentificat");
  }

  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  // Verify the attendance exists and belongs to current user's school
  const { data: existingAttendance } = await supabase
    .from("attendance")
    .select("subject_id, school_id")
    .eq("id", attendanceId)
    .maybeSingle();

  if (!existingAttendance) {
    throw new Error("Absența nu a fost găsită");
  }

  if (existingAttendance.school_id !== schoolId) {
    throw new Error("Absența nu aparține școlii dvs.");
  }

  // Verify teacher assignment
  const isAssigned = await verifyTeacherAssignment(existingAttendance.subject_id);
  if (!isAssigned) {
    throw new Error("Nu sunteți asignat la această materie");
  }

  const { error } = await supabase
    .from("attendance")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attendanceId);

  if (error) {
    handleServiceError(error, "Ștergere absență");
    throw error;
  }
}
