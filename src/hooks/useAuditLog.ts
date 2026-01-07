import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { useCallback } from "react";

interface AuditLogOptions {
  action: string;
  entityType?: string;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  schoolId?: string;
  details?: Record<string, unknown>;
}

/**
 * Hook pentru audit logging din frontend.
 * Folosește funcția log_audit_extended din Supabase.
 */
export function useAuditLog() {
  const { user, profile, activeRole } = useAuth();

  const logAction = useCallback(
    async (options: AuditLogOptions): Promise<string | null> => {
      if (!user || !activeRole) {
        console.warn("[AuditLog] Nu există user/role pentru audit");
        return null;
      }

      try {
        // Fetch school_id from profile table if not provided
        let schoolId = options.schoolId;
        if (!schoolId && user) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("school_id")
            .eq("id", user.id)
            .maybeSingle();
          schoolId = (profileData as any)?.school_id ?? null;
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

        if (error) {
          console.error("[AuditLog] Eroare la logare:", error);
          return null;
        }

        return data as string;
      } catch (err) {
        console.error("[AuditLog] Eroare neașteptată:", err);
        return null;
      }
    },
    [user, profile, activeRole]
  );

  return { logAction };
}

// Helpers pentru acțiuni comune
export const AUDIT_ACTIONS = {
  // Grades
  GRADE_CREATE: "grade.create",
  GRADE_UPDATE: "grade.update",
  GRADE_DELETE: "grade.delete",

  // Attendance
  ATTENDANCE_CREATE: "attendance.create",
  ATTENDANCE_UPDATE: "attendance.update",
  ATTENDANCE_MOTIVATE: "attendance.motivate",

  // Invitations
  INVITATION_CREATE: "invitation.create",
  INVITATION_CLAIM: "invitation.claim",
  INVITATION_REVOKE: "invitation.revoke",

  // Students
  STUDENT_CREATE: "student.create",
  STUDENT_UPDATE: "student.update",
  STUDENT_DELETE: "student.delete",

  // Users
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  USER_ROLE_SWITCH: "user.role_switch",
} as const;
