import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toFriendlySupabaseError, isConflictError, isNetworkError, CONFLICT_MESSAGE } from "@/utils/supabaseErrors";
import {
  addGrade,
  updateGrade,
  deleteGrade,
  type GradeRow,
  type GradeInsert,
  type GradeUpdate,
} from "./services/grades.service";
import { useAuditLog, AUDIT_ACTIONS } from "@/hooks/useAuditLog";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";

export type AddGradeInput = GradeInsert;

export type UpdateGradeInput = {
  gradeId: string;
  updates: GradeUpdate;
};

/**
 * Hook for adding a new grade.
 * Automatically invalidates grades, subject averages, and general averages queries.
 * Includes toast notifications and audit logging.
 */
export const useAddGrade = () => {
  const queryClient = useQueryClient();
  const { logAction } = useAuditLog();
  const { addToQueue } = useOfflineQueue();

  return useMutation({
    mutationFn: async (input: AddGradeInput): Promise<GradeRow> => {
      return addGrade(input);
    },
    onSuccess: async (data) => {
      // Log audit action
      await logAction({
        action: AUDIT_ACTIONS.GRADE_CREATE,
        entityType: "grade",
        entityId: data.id,
        newData: { grade: data.grade, student_id: data.student_id, subject_id: data.subject?.id },
      });

      // Invalidate all grade-related queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["grades"] });
      await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
      await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
      
      // Also invalidate student-scope queries that might include this student
      await queryClient.invalidateQueries({ queryKey: ["student-scope"] });

      toast.success("Notă adăugată", {
        description: `Nota ${data.grade} a fost adăugată cu succes.`,
      });
    },
    onError: async (error: Error, variables: AddGradeInput) => {
      if (isConflictError(error)) {
        toast.warning("Conflict la sincronizare", { description: CONFLICT_MESSAGE });
        await queryClient.invalidateQueries({ queryKey: ["grades"] });
        await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
        await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
        await queryClient.invalidateQueries({ queryKey: ["student-scope"] });
        return;
      }
      if (isNetworkError(error)) {
        await addToQueue("add_grade", variables);
        toast.info("Salvat local", {
          description: "Se va sincroniza automat când revii online.",
        });
        return;
      }
      toast.error("Eroare", {
        description: toFriendlySupabaseError(error, { entity: "grade", action: "add" }),
      });
    },
  });
};

/**
 * Hook for updating an existing grade.
 * Automatically invalidates grades, subject averages, and general averages queries.
 * Includes toast notifications and audit logging.
 */
export const useUpdateGrade = () => {
  const queryClient = useQueryClient();
  const { logAction } = useAuditLog();
  const { addToQueue } = useOfflineQueue();

  return useMutation({
    mutationFn: async (input: UpdateGradeInput): Promise<GradeRow> => {
      return updateGrade(input.gradeId, input.updates);
    },
    onSuccess: async (data, variables) => {
      // Log audit action
      await logAction({
        action: AUDIT_ACTIONS.GRADE_UPDATE,
        entityType: "grade",
        entityId: data.id,
        oldData: variables.updates,
        newData: { grade: data.grade, student_id: data.student_id, subject_id: data.subject?.id },
      });

      // Invalidate all grade-related queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["grades"] });
      await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
      await queryClient.invalidateQueries({ queryKey: ["general-averages"] });

      toast.success("Notă actualizată", {
        description: `Nota a fost actualizată cu succes.`,
      });
    },
    onError: async (error: Error, variables: UpdateGradeInput) => {
      if (isConflictError(error)) {
        toast.warning("Conflict la sincronizare", { description: CONFLICT_MESSAGE });
        await queryClient.invalidateQueries({ queryKey: ["grades"] });
        await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
        await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
        return;
      }
      if (isNetworkError(error)) {
        await addToQueue("update_grade", { gradeId: variables.gradeId, updates: variables.updates });
        toast.info("Salvat local", {
          description: "Se va sincroniza automat când revii online.",
        });
        return;
      }
      toast.error("Eroare", {
        description: toFriendlySupabaseError(error, { entity: "grade", action: "update" }),
      });
    },
  });
};

/**
 * Hook for deleting a grade (soft delete).
 * Automatically invalidates grades, subject averages, and general averages queries.
 * Includes toast notifications and audit logging.
 */
export const useDeleteGrade = () => {
  const queryClient = useQueryClient();
  const { logAction } = useAuditLog();
  const { addToQueue } = useOfflineQueue();

  return useMutation({
    mutationFn: async (gradeId: string): Promise<void> => {
      // Get grade data before deletion for audit log
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: grade } = await supabase
        .from("grades")
        .select("*")
        .eq("id", gradeId)
        .is("deleted_at", null)
        .single();
      
      await deleteGrade(gradeId);

      // Log audit action
      if (grade) {
        await logAction({
          action: AUDIT_ACTIONS.GRADE_DELETE,
          entityType: "grade",
          entityId: gradeId,
          oldData: grade,
        });
      }
    },
    onSuccess: async () => {
      // Invalidate all grade-related queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["grades"] });
      await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
      await queryClient.invalidateQueries({ queryKey: ["general-averages"] });

      toast.success("Notă ștearsă", {
        description: "Nota a fost ștearsă cu succes.",
      });
    },
    onError: async (error: Error, gradeId: string) => {
      if (isConflictError(error)) {
        toast.warning("Conflict la sincronizare", { description: CONFLICT_MESSAGE });
        await queryClient.invalidateQueries({ queryKey: ["grades"] });
        await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
        await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
        return;
      }
      if (isNetworkError(error)) {
        await addToQueue("delete_grade", { gradeId });
        toast.info("Salvat local", {
          description: "Se va sincroniza automat când revii online.",
        });
        return;
      }
      toast.error("Eroare", {
        description: toFriendlySupabaseError(error, { entity: "grade", action: "delete" }),
      });
    },
  });
};
