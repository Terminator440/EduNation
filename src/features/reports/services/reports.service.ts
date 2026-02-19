/**
 * Reporting service – student report and class report via RPC.
 * Used for PDF export and report views. No direct table writes.
 */

import { supabase } from "@/integrations/supabase/client";
import { handleServiceError } from "@/lib/error-handler";

export type StudentReportPayload = {
  success: boolean;
  error?: string;
  student_id?: string;
  student_name?: string | null;
  class_name?: string | null;
  grades?: Array<{
    id: string;
    date: string;
    grade: number;
    description: string | null;
    subject_id: string;
    subject_name: string | null;
  }>;
  attendance?: Array<{
    id: string;
    date: string;
    status: string;
    is_excused: boolean;
    subject_id: string;
    subject_name: string | null;
  }>;
  subject_averages?: Array<{
    subject_id: string;
    subject_name: string | null;
    average: number;
    grade_count: number;
  }>;
};

export type ClassReportPayload = {
  success: boolean;
  error?: string;
  class_id?: string;
  class_name?: string;
  students?: Array<{
    student_id: string;
    student_name: string | null;
    student_number: number | null;
    subject_averages: Array<{ subject_name: string | null; average: number }>;
    total_absences: number;
    general_average: number | null;
  }>;
};

/**
 * Fetch full student report (grades + attendance + averages) via RPC.
 * Permissions enforced server-side.
 */
export async function fetchStudentReport(studentId: string): Promise<StudentReportPayload> {
  const { data, error } = await supabase.rpc("get_student_report", {
    p_student_id: studentId,
  });
  if (error) {
    handleServiceError(error, "Raport elev");
    throw error;
  }
  const result = data as StudentReportPayload | null;
  if (!result?.success) {
    throw new Error(result?.error ?? "Raport elev eșuat");
  }
  return result;
}

/**
 * Fetch class report (per-student summary) via RPC.
 * Permissions enforced server-side.
 */
export async function fetchClassReport(classId: string): Promise<ClassReportPayload> {
  const { data, error } = await supabase.rpc("get_class_report", {
    p_class_id: classId,
  });
  if (error) {
    handleServiceError(error, "Raport clasă");
    throw error;
  }
  const result = data as ClassReportPayload | null;
  if (!result?.success) {
    throw new Error(result?.error ?? "Raport clasă eșuat");
  }
  return result;
}
