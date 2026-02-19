/**
 * Attendance hooks – single entry for useAttendance, useAddAttendance, useUpdateAttendance, useDeleteAttendance.
 * Mutations go through RPC (mark_attendance, delete_attendance).
 */

import { useAttendanceForScope } from "@/features/academics/queries";
import {
  useAddAttendance,
  useUpdateAttendance,
  useDeleteAttendance,
  type AddAttendanceInput,
  type UpdateAttendanceInput,
} from "@/features/attendance/queries";

/** Fetch attendance for a list of student IDs (scope). Uses RLS; data read from DB. */
export const useAttendance = useAttendanceForScope;

export { useAddAttendance, useUpdateAttendance, useDeleteAttendance };
export type { AddAttendanceInput, UpdateAttendanceInput };
