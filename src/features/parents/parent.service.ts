/**
 * Parent portal API: link parent to student (invitation flow).
 * POST /parents/link-student equivalent: create invitation for parent role + student_id,
 * return code for the parent to claim (creates parent_student_relations on claim).
 */
import { createInvitation } from "@/lib/invitations";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";

export type LinkParentToStudentResult =
  | { success: true; invitation_id: string; code: string }
  | { success: false; error_message: string };

/**
 * Link a parent to a student by creating a parent invitation.
 * Caller (director/secretariat) must have permission in the school.
 * Parent receives the returned code to claim the invitation; on claim, parent_student_relations is created.
 */
export async function linkParentToStudent(
  schoolId: string,
  studentId: string,
  parentEmail: string
): Promise<LinkParentToStudentResult> {
  const currentSchoolId = await getCurrentUserSchoolId();
  if (!currentSchoolId || currentSchoolId !== schoolId) {
    return { success: false, error_message: "Nu aveți permisiunea pentru această școală." };
  }
  const result = await createInvitation("parent", schoolId, {
    studentId,
    invitedEmail: parentEmail,
    maxUses: 1,
    expiresHours: 168, // 7 days
  });
  if (!result.success) {
    return { success: false, error_message: result.error_message ?? "Eroare la crearea invitației." };
  }
  return {
    success: true,
    invitation_id: result.invitation_id!,
    code: result.plain_code ?? "",
  };
}
