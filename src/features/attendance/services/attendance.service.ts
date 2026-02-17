import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";

export type AttendanceRow = {
  id: string;
  date: string;
  status: string;
  student_id: string;
  subject: { id: string; name: string; teacher_id: string | null } | null;
};

export async function fetchAttendanceForStudents(
  studentIds: string[]
): Promise<AttendanceRow[]> {
  if (studentIds.length === 0) return [];
  const res = await supabase
    .from("attendance")
    .select("id,date,status,student_id, subject:subjects(id,name,teacher_id)")
    .in("student_id", studentIds)
    .order("date", { ascending: false });
  return assertSupabaseOk(res, "attendance.select");
}
