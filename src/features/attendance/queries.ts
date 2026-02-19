import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toFriendlySupabaseError, isConflictError, isNetworkError, CONFLICT_MESSAGE } from "@/utils/supabaseErrors";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";
import {
  addAttendance,
  updateAttendance,
  deleteAttendance,
  type AttendanceRow,
  type AttendanceInsert,
  type AttendanceUpdate,
} from "./services/attendance.service";
import { useAuditLog, AUDIT_ACTIONS } from "@/hooks/useAuditLog";

export type AddAttendanceInput = AttendanceInsert;

export type UpdateAttendanceInput = {
  attendanceId: string;
  updates: AttendanceUpdate;
};

/**
 * Hook for adding a new attendance record.
 * Automatically invalidates attendance queries.
 * Includes toast notifications and audit logging.
 */
export const useAddAttendance = () => {
  const queryClient = useQueryClient();
  const { logAction } = useAuditLog();
  const { addToQueue } = useOfflineQueue();

  return useMutation({
    mutationFn: async (input: AddAttendanceInput): Promise<AttendanceRow> => {
      return addAttendance(input);
    },
    onSuccess: async (data) => {
      // Log audit action
      await logAction({
        action: AUDIT_ACTIONS.ATTENDANCE_CREATE,
        entityType: "attendance",
        entityId: data.id,
        newData: { status: data.status, is_excused: data.is_excused, student_id: data.student_id },
      });

      // Invalidate attendance queries
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });

      toast.success("Absență înregistrată", {
        description: `Absența a fost înregistrată cu succes.`,
      });
    },
    onError: async (error: Error, variables: AddAttendanceInput) => {
      if (isConflictError(error)) {
        toast.warning("Conflict la sincronizare", { description: CONFLICT_MESSAGE });
        await queryClient.invalidateQueries({ queryKey: ["attendance"] });
        return;
      }
      if (isNetworkError(error)) {
        await addToQueue("add_attendance", variables);
        toast.info("Salvat local", {
          description: "Se va sincroniza automat când revii online.",
        });
        return;
      }
      toast.error("Eroare", {
        description: toFriendlySupabaseError(error, { entity: "attendance", action: "add" }),
      });
    },
  });
};

/**
 * Hook for updating an existing attendance record.
 * Automatically invalidates attendance queries.
 * Includes toast notifications and audit logging.
 */
export const useUpdateAttendance = () => {
  const queryClient = useQueryClient();
  const { logAction } = useAuditLog();
  const { addToQueue } = useOfflineQueue();

  return useMutation({
    mutationFn: async (input: UpdateAttendanceInput): Promise<AttendanceRow> => {
      return updateAttendance(input.attendanceId, input.updates);
    },
    onSuccess: async (data, variables) => {
      // Log audit action (especially for motivation)
      if (variables.updates.is_excused !== undefined) {
        await logAction({
          action: AUDIT_ACTIONS.ATTENDANCE_MOTIVATE,
          entityType: "attendance",
          entityId: data.id,
          oldData: { is_excused: !variables.updates.is_excused },
          newData: { is_excused: variables.updates.is_excused },
        });
      } else {
        await logAction({
          action: AUDIT_ACTIONS.ATTENDANCE_UPDATE,
          entityType: "attendance",
          entityId: data.id,
          oldData: variables.updates,
          newData: { status: data.status, is_excused: data.is_excused },
        });
      }

      // Invalidate attendance queries
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });

      toast.success("Absență actualizată", {
        description: `Absența a fost actualizată cu succes.`,
      });
    },
    onError: async (error: Error, variables: UpdateAttendanceInput) => {
      if (isConflictError(error)) {
        toast.warning("Conflict la sincronizare", { description: CONFLICT_MESSAGE });
        await queryClient.invalidateQueries({ queryKey: ["attendance"] });
        return;
      }
      if (isNetworkError(error)) {
        await addToQueue("update_attendance", {
          attendanceId: variables.attendanceId,
          updates: variables.updates,
        });
        toast.info("Salvat local", {
          description: "Se va sincroniza automat când revii online.",
        });
        return;
      }
      toast.error("Eroare", {
        description: toFriendlySupabaseError(error, { entity: "attendance", action: "update" }),
      });
    },
  });
};

/**
 * Hook for deleting an attendance record (soft delete).
 * Automatically invalidates attendance queries.
 * Includes toast notifications and audit logging.
 */
export const useDeleteAttendance = () => {
  const queryClient = useQueryClient();
  const { logAction } = useAuditLog();
  const { addToQueue } = useOfflineQueue();

  return useMutation({
    mutationFn: async (attendanceId: string): Promise<void> => {
      // Get attendance data before deletion for audit log
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: attendance } = await supabase
        .from("attendance")
        .select("*")
        .eq("id", attendanceId)
        .is("deleted_at", null)
        .single();
      
      await deleteAttendance(attendanceId);

      // Log audit action
      if (attendance) {
        await logAction({
          action: AUDIT_ACTIONS.ATTENDANCE_UPDATE,
          entityType: "attendance",
          entityId: attendanceId,
          oldData: attendance,
        });
      }
    },
    onSuccess: async () => {
      // Invalidate attendance queries
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });

      toast.success("Absență ștearsă", {
        description: "Absența a fost ștearsă cu succes.",
      });
    },
    onError: async (error: Error, attendanceId: string) => {
      if (isConflictError(error)) {
        toast.warning("Conflict la sincronizare", { description: CONFLICT_MESSAGE });
        await queryClient.invalidateQueries({ queryKey: ["attendance"] });
        return;
      }
      if (isNetworkError(error)) {
        await addToQueue("delete_attendance", { attendanceId });
        toast.info("Salvat local", {
          description: "Se va sincroniza automat când revii online.",
        });
        return;
      }
      toast.error("Eroare", {
        description: toFriendlySupabaseError(error, { entity: "attendance", action: "delete" }),
      });
    },
  });
};
