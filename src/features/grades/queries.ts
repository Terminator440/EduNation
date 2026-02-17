import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addGrade,
  updateGrade,
  deleteGrade,
  type GradeRow,
} from "./services/grades.service";

export type AddGradeInput = {
  studentId: string;
  subjectId: string;
  grade: number;
  options?: {
    date?: string;
    description?: string | null;
    schoolYearId?: string | null;
  };
};

export type UpdateGradeInput = {
  gradeId: string;
  updates: {
    grade?: number;
    date?: string;
    description?: string | null;
  };
};

/**
 * Hook for adding a new grade.
 * Automatically invalidates grades, subject averages, and general averages queries.
 */
export const useAddGrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddGradeInput): Promise<GradeRow> => {
      return addGrade(input.studentId, input.subjectId, input.grade, input.options);
    },
    onSuccess: async () => {
      // Invalidate all grade-related queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["grades"] });
      await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
      await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
      
      // Also invalidate student-scope queries that might include this student
      await queryClient.invalidateQueries({ queryKey: ["student-scope"] });
    },
  });
};

/**
 * Hook for updating an existing grade.
 * Automatically invalidates grades, subject averages, and general averages queries.
 */
export const useUpdateGrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateGradeInput): Promise<GradeRow> => {
      return updateGrade(input.gradeId, input.updates);
    },
    onSuccess: async () => {
      // Invalidate all grade-related queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["grades"] });
      await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
      await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
    },
  });
};

/**
 * Hook for deleting a grade (soft delete).
 * Automatically invalidates grades, subject averages, and general averages queries.
 */
export const useDeleteGrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (gradeId: string): Promise<void> => {
      return deleteGrade(gradeId);
    },
    onSuccess: async () => {
      // Invalidate all grade-related queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["grades"] });
      await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
      await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
    },
  });
};
