/**
 * Grades hooks – single entry for useGrades, useAddGrade, useUpdateGrade, useDeleteGrade.
 * Permissions and mutations go through RPC (add_grade, update_grade, delete_grade).
 */

import { useGradesForScope } from "@/features/academics/queries";
import {
  useAddGrade,
  useUpdateGrade,
  useDeleteGrade,
  type AddGradeInput,
  type UpdateGradeInput,
} from "@/features/grades/queries";

/** Fetch grades for a list of student IDs (scope). Uses RLS; data read from DB. */
export const useGrades = useGradesForScope;

export { useAddGrade, useUpdateGrade, useDeleteGrade };
export type { AddGradeInput, UpdateGradeInput };
