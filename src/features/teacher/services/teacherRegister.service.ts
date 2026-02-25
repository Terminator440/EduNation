/**
 * Teacher register (condică): sign register, fetch data for TakeAttendance.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { logError } from "@/lib/logger";
import { handleServiceError } from "@/lib/error-handler";
import { AppError } from "@/lib/errors";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

export type ClassRow = { id: string; name: string };
export type SubjectRow = { id: string; name: string };
export type RegisterRow = { id: string; timetable_entry_id: string };
export type StudentRow = { id: string; student_number: string | number | null; full_name: string | null };

export async function fetchClassesByIds(
  classIds: string[],
  schoolId?: string | null
): Promise<ClassRow[]> {
  if (classIds.length === 0) return [];
  let query = supabase.from("classes").select("id, name").in("id", classIds);
  if (schoolId) query = query.eq("school_id", schoolId);
  const { data, error } = await query;
  if (error) {
    logError("Fetch classes", error, { context: "fetchClassesByIds" });
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchClassesByIds", cause: error });
  }
  return (data ?? []) as ClassRow[];
}

export async function fetchSubjectsByIds(
  subjectIds: string[],
  schoolId?: string | null
): Promise<SubjectRow[]> {
  if (subjectIds.length === 0) return [];
  let query = supabase.from("subjects").select("id, name").in("id", subjectIds);
  if (schoolId) query = query.eq("school_id", schoolId);
  const { data, error } = await query;
  if (error) {
    logError("Fetch subjects", error, { context: "fetchSubjectsByIds" });
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchSubjectsByIds", cause: error });
  }
  return (data ?? []) as SubjectRow[];
}

export async function fetchRegisterForTeacher(
  teacherId: string,
  dateKey: string
): Promise<RegisterRow[]> {
  const { data, error } = await supabase
    .from("teacher_register")
    .select("id, timetable_entry_id")
    .eq("teacher_id", teacherId)
    .eq("date", dateKey);
  if (error) {
    logError("Fetch register", error, { context: "fetchRegisterForTeacher" });
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchRegisterForTeacher", cause: error });
  }
  return (data ?? []) as RegisterRow[];
}

export async function fetchStudentsByClass(
  classId: string,
  schoolId: string
): Promise<StudentRow[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, student_number, full_name")
    .eq("class_id", classId)
    .eq("school_id", schoolId)
    .order("student_number", { ascending: true });
  if (error) {
    logError("Fetch students by class", error, { context: "fetchStudentsByClass" });
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchStudentsByClass", cause: error });
  }
  return (data ?? []) as StudentRow[];
}

export type SignRegisterPayload = {
  timetable_entry_id: string;
  teacher_id: string;
  class_id: string | null;
  subject_id: string | null;
  date: string;
  notes: string | null;
};

export type TimetableEntryRow = {
  id: string;
  weekday: number;
  period: number;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  class_id: string | null;
  subject_id: string | null;
};

export async function fetchTimetableEntriesForTeacher(
  teacherId: string,
  weekday: number
): Promise<TimetableEntryRow[]> {
  const { data, error } = await supabase
    .from("timetable_entries")
    .select("id, weekday, period, start_time, end_time, room, class_id, subject_id")
    .eq("teacher_id", teacherId)
    .eq("weekday", weekday)
    .order("period", { ascending: true });
  if (error) {
    logError("Fetch timetable entries", error, { context: "fetchTimetableEntriesForTeacher" });
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchTimetableEntriesForTeacher", cause: error });
  }
  return (data ?? []) as TimetableEntryRow[];
}

export async function fetchHomeroomClassId(schoolId: string, teacherId: string): Promise<string | null> {
  const { data } = await supabase
    .from("classes")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function fetchTeacherAssignmentClassId(schoolId: string, teacherId: string): Promise<string | null> {
  const { data } = await supabase
    .from("teacher_assignments")
    .select("class_id")
    .eq("teacher_id", teacherId)
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();
  return (data as { class_id?: string } | null)?.class_id ?? null;
}

export type TeacherStudentRow = {
  id: string;
  user_id: string | null;
  student_number: number | null;
  full_name: string | null;
};

export async function fetchStudentsForClass(
  classId: string,
  schoolId: string
): Promise<TeacherStudentRow[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, user_id, student_number, full_name")
    .eq("class_id", classId)
    .eq("school_id", schoolId);
  if (error) {
    logError("Fetch students for class", error, { context: "fetchStudentsForClass" });
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchStudentsForClass", cause: error });
  }
  return (data ?? []) as TeacherStudentRow[];
}

export type ProfileLite = { id: string; full_name: string | null; email: string };

export async function fetchSubjectsForTeacherClass(
  teacherId: string,
  classId: string,
  schoolId: string
): Promise<SubjectRow[]> {
  const { data: assignments } = await supabase
    .from("teacher_assignments")
    .select("subject_id")
    .eq("teacher_id", teacherId)
    .eq("class_id", classId)
    .eq("school_id", schoolId);
  const subjectIds = (assignments ?? [])
    .map((r: { subject_id: string }) => r.subject_id)
    .filter(Boolean) as string[];
  if (subjectIds.length > 0) {
    return fetchSubjectsByIds(subjectIds, schoolId);
  }
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("class_id", classId)
    .eq("school_id", schoolId);
  if (error) {
    logError("Fetch subjects for teacher class", error, { context: "fetchSubjectsForTeacherClass" });
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchSubjectsForTeacherClass", cause: error });
  }
  return (data ?? []) as SubjectRow[];
}

export async function fetchProfilesByIds(userIds: string[], schoolId?: string | null): Promise<Map<string, ProfileLite>> {
  if (userIds.length === 0) return new Map();
  let query = supabase.from("profiles").select("id, full_name, email").in("id", userIds);
  if (schoolId) query = query.eq("school_id", schoolId);
  const { data, error } = await query;
  if (error) {
    logError("Fetch profiles by ids", error, { context: "fetchProfilesByIds" });
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchProfilesByIds", cause: error });
  }
  const map = new Map<string, ProfileLite>();
  (data ?? []).forEach((p: ProfileLite) => map.set(p.id, p));
  return map;
}

export async function signRegister(payload: SignRegisterPayload): Promise<void> {
  const { error } = await supabase.from("teacher_register").insert(payload);
  if (error) {
    logError("Sign register", error, { context: "signRegister" });
    handleServiceError(error, "Semnare condică");
    throw new AppError(toFriendlySupabaseError(error), { context: "signRegister", cause: error });
  }
}
