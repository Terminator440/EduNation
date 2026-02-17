import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { useCallback } from "react";

/**
 * Nomenclator strict pentru acțiunile de audit.
 * OBLIGATORIU: Folosiți acest obiect în loc de string-uri libere!
 */
export const AUDIT_ACTIONS = {
  // Gestiune Note (Critice pentru Minister)
  GRADE_CREATE: "grade.create",
  GRADE_UPDATE: "grade.update",
  GRADE_DELETE: "grade.delete",

  // Absențe
  ATTENDANCE_CREATE: "attendance.create",
  ATTENDANCE_UPDATE: "attendance.update",
  ATTENDANCE_MOTIVATE: "attendance.motivate",

  // Securitate și Acces
  INVITATION_CREATE: "invitation.create",
  INVITATION_CLAIM: "invitation.claim",
  INVITATION_REVOKE: "invitation.revoke",
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  USER_ROLE_SWITCH: "user.role_switch",

  // Administrare Entități
  STUDENT_CREATE: "student.create",
  STUDENT_UPDATE: "student.update",
  STUDENT_DELETE: "student.delete",
  CLASS_CREATE: "class.create",
  SCHOOL_UPDATE: "school.update",

  // Export date (Cerință legală: să știm cine a extras datele)
  DATA_EXPORT: "data.export",
} as const;

// Creăm un tip din valorile obiectului pentru Type Safety maxim
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface AuditLogOptions {
  action: AuditAction; // Forțăm utilizarea nomenclatorului
  entityType?: string;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  schoolId?: string;
  details?: Record<string, unknown>;
}

export function useAuditLog() {
  const { user, profile, activeRole } = useAuth();

  const logAction = useCallback(
    async (options: AuditLogOptions): Promise<string | null> => {
      if (!user || !activeRole) {
        console.warn("[AuditLog] Lipsă sesiune - logarea a fost abandonată.");
        return null;
      }

      try {
        let schoolId = options.schoolId;

        // Dacă nu avem schoolId, îl luăm din profil (necesar pentru multi-tenancy)
        if (!schoolId && user) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("school_id")
            .eq("id", user.id)
            .maybeSingle();
          schoolId = profileData?.school_id ?? undefined;
        }

        const { data, error } = await supabase.rpc("log_audit_extended", {
          _user_id: user.id,
          _user_name: profile?.full_name || user.email || "Unknown",
          _active_role: activeRole as AppRole,
          _action: options.action,
          _entity_type: options.entityType ?? null,
          _entity_id: options.entityId ?? null,
          _old_data: options.oldData ? JSON.stringify(options.oldData) : null,
          _new_data: options.newData ? JSON.stringify(options.newData) : null,
          _school_id: schoolId ?? null,
          _details: options.details ? JSON.stringify(options.details) : null,
        });

        if (error) throw error;
        return data as string;
      } catch (err) {
        // În producție, aici am putea trimite eroarea către Sentry
        console.error("[AuditLog] Eroare critică la salvarea log-ului:", err);
        return null;
      }
    },
    [user, profile, activeRole]
  );

  return { logAction };
}
