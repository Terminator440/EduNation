/**
 * Auth onboarding: create student/parent records on signup.
 * All DB access here; no direct supabase in UI.
 */
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { handleServiceError } from "@/lib/error-handler";
import { AppError } from "@/lib/errors";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

export type CreateStudentOnSignupPayload = {
  user_id: string;
  class_id: string;
  full_name: string;
  student_number: number | null;
  school_id?: string;
};

export async function createStudentOnSignup(payload: CreateStudentOnSignupPayload): Promise<void> {
  const row = {
    user_id: payload.user_id,
    class_id: payload.class_id,
    full_name: payload.full_name,
    student_number: payload.student_number,
    ...(payload.school_id ? { school_id: payload.school_id } : {}),
  };
  const { error } = await supabase.from("students").insert(row);
  if (error) {
    logError("Create student on signup", error, { context: "createStudentOnSignup" });
    handleServiceError(error, "Creare elev la înregistrare");
    throw new AppError(toFriendlySupabaseError(error), { context: "createStudentOnSignup", cause: error });
  }
}

export async function createParentStudentRelation(
  parentUserId: string,
  studentId: string
): Promise<void> {
  const { error } = await supabase.from("parent_student_relations").insert({
    parent_user_id: parentUserId,
    student_id: studentId,
  });
  if (error) {
    logError("Create parent-student relation", error, { context: "createParentStudentRelation" });
    handleServiceError(error, "Creare relație părinte-elev");
    throw new AppError(toFriendlySupabaseError(error), { context: "createParentStudentRelation", cause: error });
  }
}
