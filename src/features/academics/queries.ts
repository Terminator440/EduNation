import { useQuery } from "@tanstack/react-query";
import {
  fetchStudentScope,
  fetchStudentNames,
  type StudentScope,
  type StudentNameRow,
} from "@/features/users/services/users.service";
import {
  fetchGradesForStudents,
  fetchSubjectAverages,
  fetchGeneralAverages,
  type GradeRow,
  type SubjectAverageRow,
} from "@/features/grades/services/grades.service";
import {
  fetchAttendanceForStudents,
  type AttendanceRow,
} from "@/features/attendance/services/attendance.service";

// Re-export types for consumers
export type { StudentScope, StudentNameRow, GradeRow, SubjectAverageRow, AttendanceRow };

export const useStudentScope = (activeRole: string | null, userId: string | null) =>
  useQuery({
    queryKey: ["student-scope", activeRole, userId],
    enabled: Boolean(activeRole && userId),
    queryFn: () => fetchStudentScope(activeRole!, userId!),
  });

export const useStudentsForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["students-names", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchStudentNames(studentIds),
  });

export const useGradesForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["grades", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchGradesForStudents(studentIds),
  });

export const useSubjectAveragesForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["subject-averages", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchSubjectAverages(studentIds),
  });

export const useGeneralAveragesForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["general-averages", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchGeneralAverages(studentIds),
  });

export const useAttendanceForScope = (studentIds: string[]) =>
  useQuery({
    queryKey: ["attendance", studentIds],
    enabled: studentIds.length > 0,
    queryFn: () => fetchAttendanceForStudents(studentIds),
  });
