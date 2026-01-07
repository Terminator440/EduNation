import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useAuth";

export type InvitationRole = 
  | "director" 
  | "teacher" 
  | "homeroom_teacher" 
  | "student" 
  | "parent" 
  | "secretariat";

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
  current_uses: number; // Mapat din uses_count dacă e cazul
  revoked_at: string | null;
  created_at: string;
}

export const hashInvitationCode = async (code: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(code.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const validateInvitationCode = async (code: string) => {
  try {
    const codeHash = await hashInvitationCode(code);
    const { data, error } = await supabase
      .from("invitations")
      .select("*")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (error) return { valid: false, error: "Eroare la baza de date." };
    if (!data) return { valid: false, error: "Codul nu există." };

    const inv = data as any;
    const now = new Date();
    const expiresAt = new Date(inv.expires_at);

    if (inv.revoked_at) return { valid: false, error: "Cod revocat." };
    if (expiresAt < now) return { valid: false, error: "Cod expirat." };
    if ((inv.uses_count || inv.current_uses) >= inv.max_uses) 
      return { valid: false, error: "Cod deja utilizat." };

    return { 
      valid: true, 
      invitation: {
        ...inv,
        current_uses: inv.uses_count || inv.current_uses || 0
      } as Invitation 
    };
  } catch (err) {
    return { valid: false, error: "Eroare sistem." };
  }
};

export const claimInvitation = async (code: string, userId: string) => {
  const codeHash = await hashInvitationCode(code);
  const { data, error } = await supabase.rpc("claim_invitation", {
    p_code_hash: codeHash,
    p_user_id: userId,
  });
  if (error) return { success: false, error_message: error.message };
  return (Array.isArray(data) ? data[0] : data);
};

export const getRoleLabelRo = (role: string): string => {
  const labels: Record<string, string> = {
    director: "Director",
    teacher: "Profesor",
    homeroom_teacher: "Diriginte",
    student: "Elev",
    parent: "Părinte",
    secretariat: "Secretariat",
  };
  return labels[role] || role;
};