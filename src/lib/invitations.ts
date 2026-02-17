import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useAuth";

export type InvitationRole =
  | "director"
  | "teacher"
  | "homeroom_teacher"
  | "secretariat"
  | "student"
  | "parent";

export const invitationRoleToAppRole = (role: InvitationRole): AppRole =>
  role as AppRole;

export interface Invitation {
  id: string;
  code_hash: string;
  role: InvitationRole;
  school_id: string;
  class_id: string | null;
  student_id: string | null;
  created_by_user_id: string;
  expires_at: string;
  max_uses: number;
  current_uses: number;
  used_at: string | null;
  used_by_user_id: string | null;
  revoked_at: string | null;
  created_at: string;
  intended_for: string | null;
  first_name?: string | null;
  last_name?: string | null;
  invited_student_number?: number | null;
  invited_email?: string | null;
  invited_phone?: string | null;
}

export interface InvitationWithDetails extends Invitation {
  school_name?: string;
  class_name?: string;
  student_name?: string;
  created_by_name?: string;
}

export type InvitationStatus = "pending" | "used" | "expired" | "revoked";

export const getInvitationStatus = (inv: Invitation): InvitationStatus => {
  if (inv.revoked_at) return "revoked";
  if (new Date(inv.expires_at) < new Date()) return "expired";
  if (inv.current_uses >= inv.max_uses) return "used";
  return "pending";
};

export const hashInvitationCode = async (code: string): Promise<string> => {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const validateInvitationCode = async (
  code: string
): Promise<{
  valid: boolean;
  invitation?: Invitation;
  error?: string;
}> => {
  try {
    const codeHash = await hashInvitationCode(code);

    const { data, error } = await supabase
      .from("invitations")
      .select("*")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (error) return { valid: false, error: "Eroare la verificarea codului." };
    if (!data) return { valid: false, error: "Codul de invitație nu există." };

    const inv = data as Invitation;
    const status = getInvitationStatus(inv);

    if (status === "revoked")
      return { valid: false, error: "Codul de invitație a fost revocat." };
    if (status === "expired")
      return { valid: false, error: "Codul de invitație a expirat." };
    if (status === "used")
      return { valid: false, error: "Codul de invitație a fost deja folosit." };

    return { valid: true, invitation: inv };
  } catch (err) {
    console.error("Error validating invitation:", err);
    return { valid: false, error: "Eroare la verificarea codului." };
  }
};

export interface ClaimInvitationResult {
  success: boolean;
  invitation_id?: string;
  role?: InvitationRole;
  school_id?: string;
  class_id?: string | null;
  student_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  invited_student_number?: number | null;
  invited_email?: string | null;
  invited_phone?: string | null;
  error_message?: string;
}

export const claimInvitation = async (
  code: string,
  userId: string
): Promise<ClaimInvitationResult> => {
  try {
    const codeHash = await hashInvitationCode(code);

    const { data, error } = await supabase.rpc("claim_invitation", {
      p_code_hash: codeHash,
      p_user_id: userId,
    });

    if (error) {
      console.error("Claim invitation error:", error);
      return { success: false, error_message: error.message };
    }

    type ClaimResult = {
      success: boolean;
      error_message?: string;
      invitation_id?: string;
      role?: string;
      school_id?: string;
      class_id?: string | null;
      student_id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      invited_student_number?: number | null;
    };
    const result: ClaimResult = Array.isArray(data) ? (data[0] as ClaimResult) : (data as ClaimResult);

    if (!result || !result.success) {
      return {
        success: false,
        error_message: result?.error_message || "Eroare la validarea invitației.",
      };
    }

    return {
      success: true,
      invitation_id: result.invitation_id,
      role: result.role as InvitationRole,
      school_id: result.school_id,
      class_id: result.class_id ?? null,
      student_id: result.student_id ?? null,
      first_name: result.first_name ?? null,
      last_name: result.last_name ?? null,
      invited_student_number: result.invited_student_number ?? null,
      invited_email: result.invited_email ?? null,
      invited_phone: result.invited_phone ?? null,
    };
  } catch (err) {
    console.error("Error claiming invitation:", err);
    return { success: false, error_message: "Eroare la procesarea invitației." };
  }
};

export interface CreateInvitationResult {
  success: boolean;
  invitation_id?: string;
  plain_code?: string;
  error_message?: string;
}

export const createInvitation = async (
  role: InvitationRole,
  schoolId: string,
  options?: {
    classId?: string;
    studentId?: string;
    firstName?: string;
    lastName?: string;
    studentNumber?: number;
    invitedEmail?: string;
    invitedPhone?: string;
    maxUses?: number;
    expiresHours?: number;
    intendedFor?: string;
  }
): Promise<CreateInvitationResult> => {
  try {
    type CreateInvitationParams = {
      p_role: InvitationRole;
      p_school_id: string;
      p_class_id: string | null;
      p_student_id: string | null;
      p_first_name: string | null;
      p_last_name: string | null;
      p_student_number: number | null;
      p_invited_email: string | null;
      p_invited_phone: string | null;
      p_intended_for: string | null;
      p_max_uses: number;
      p_expires_hours: number;
    };
    const { data, error } = await supabase.rpc<CreateInvitationParams, unknown>("create_invitation", {
      p_role: role,
      p_school_id: schoolId,
      p_class_id: options?.classId ?? null,
      p_student_id: options?.studentId ?? null,
      p_first_name: options?.firstName ?? null,
      p_last_name: options?.lastName ?? null,
      p_student_number: options?.studentNumber ?? null,
      p_invited_email: options?.invitedEmail ?? null,
      p_invited_phone: options?.invitedPhone ?? null,
      p_intended_for: options?.intendedFor ?? null,
      p_max_uses: options?.maxUses ?? 1,
      p_expires_hours: options?.expiresHours ?? 24,
    });

    if (error) {
      console.error("Create invitation error:", error);
      return { success: false, error_message: error.message };
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result || result.error_message) {
      return {
        success: false,
        error_message: result?.error_message || "Eroare la crearea invitației.",
      };
    }

    return {
      success: true,
      invitation_id: result.invitation_id,
      plain_code: result.plain_code,
    };
  } catch (err: unknown) {
    console.error("Error creating invitation:", err);
    const errorMessage = err instanceof Error ? err.message : "Eroare la crearea invitației.";
    return {
      success: false,
      error_message: errorMessage,
    };
  }
};

export const revokeInvitation = async (
  invitationId: string
): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc("revoke_invitation", {
      p_invitation_id: invitationId,
    });

    if (error) {
      console.error("Revoke invitation error:", error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error("Error revoking invitation:", err);
    return false;
  }
};

export const getRoleLabelRo = (role: InvitationRole): string => {
  const labels: Record<InvitationRole, string> = {
    director: "Director",
    teacher: "Profesor",
    homeroom_teacher: "Diriginte",
    secretariat: "Secretariat",
    student: "Elev",
    parent: "Părinte",
  };

  return labels[role] || role;
};

export const getStatusLabelRo = (status: InvitationStatus): string => {
  const labels: Record<InvitationStatus, string> = {
    pending: "În așteptare",
    used: "Folosit",
    expired: "Expirat",
    revoked: "Revocat",
  };

  return labels[status] || status;
};

export const getStatusColor = (
  status: InvitationStatus
): "default" | "secondary" | "destructive" | "outline" => {
  const colors: Record<
    InvitationStatus,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    pending: "default",
    used: "secondary",
    expired: "outline",
    revoked: "destructive",
  };

  return colors[status] || "outline";
};

export const listInvitations = async ({
  schoolId,
  classId,
  createdByUserId,
  limit = 50,
}: {
  schoolId?: string | null;
  classId?: string | null;
  createdByUserId?: string | null;
  limit?: number;
}) => {
  let query = supabase
    .from("invitations")
    .select(
      "id, role, school_id, class_id, student_id, created_by_user_id, created_at, expires_at, used_at, revoked_at, max_uses, current_uses, intended_for"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (schoolId) query = query.eq("school_id", schoolId);
  if (classId) query = query.eq("class_id", classId);
  if (createdByUserId) query = query.eq("created_by_user_id", createdByUserId);

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
};
