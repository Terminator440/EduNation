import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { assertSupabaseOk } from '@/lib/supabase-helpers';

export type StudentScope = {
  studentIds: string[];
};

/**
 * Returns the student ids visible for the current user, based on active role.
 * - student: their own student row
 * - parent: linked students via parent_student_relations
 */
export const useStudentScope = (activeRole: string | null, userId: string | null) => {
  return useQuery({
    queryKey: ['student-scope', activeRole, userId],
    enabled: Boolean(activeRole && userId),
    queryFn: async (): Promise<StudentScope> => {
      if (!activeRole || !userId) return { studentIds: [] };

      if (activeRole === 'student') {
        const res = await supabase
          .from('students')
          .select('id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();
        const row = assertSupabaseOk(res, 'students.select(student)');
        return { studentIds: row?.id ? [row.id] : [] };
      }

      if (activeRole === 'parent') {
        const res = await supabase
          .from('parent_student_relations')
          .select('student_id')
          .eq('parent_user_id', userId);
        const rows = assertSupabaseOk(res, 'parent_student_relations.select(parent)');
        return { studentIds: (rows || []).map(r => r.student_id) };
      }

      return { studentIds: [] };
    },
  });
};

export type GradeRow = {
  id: string;
  date: string;
  grade: number;
  description: string | null;
  student_id: string;
  subject: { id: string; name: string; teacher_id: string | null } | null;
};

export type StudentNameRow = { id: string; full_name: string | null };

export const useStudentsForScope = (studentIds: string[]) => {
  return useQuery({
    queryKey: ['students-names', studentIds],
    enabled: studentIds.length > 0,
    queryFn: async (): Promise<StudentNameRow[]> => {
      if (studentIds.length === 0) return [];
      const res = await supabase
        .from('students')
        .select('id, full_name')
        .in('id', studentIds);
      return assertSupabaseOk(res, 'students.select(names)') ?? [];
    },
  });
};

/** Raw grades from DB (for display only - averages come from views/RPC) */
export const useGradesForScope = (studentIds: string[]) => {
  return useQuery({
    queryKey: ['grades', studentIds],
    enabled: studentIds.length > 0,
    queryFn: async (): Promise<GradeRow[]> => {
      const res = await supabase
        .from('grades')
        .select('id,date,grade,description,student_id, subject:subjects(id,name,teacher_id)')
        .in('student_id', studentIds)
        .order('date', { ascending: false });
      return assertSupabaseOk(res, 'grades.select');
    },
  });
};

export type SubjectAverageRow = {
  student_id: string;
  subject_id: string;
  subject_name: string;
  average: number;
  grade_count: number;
};

/** Medii pe materii - citesc din views/RPC (nu se calculează în frontend) */
export const useSubjectAveragesForScope = (studentIds: string[]) => {
  return useQuery({
    queryKey: ['subject-averages', studentIds],
    enabled: studentIds.length > 0,
    queryFn: async (): Promise<SubjectAverageRow[]> => {
      if (studentIds.length === 0) return [];
      const { data, error } = await supabase
        .from('v_student_subject_averages')
        .select('student_id, subject_id, subject_name, average, grade_count')
        .in('student_id', studentIds);
      if (error) throw error;
      return (data ?? []).map(r => ({
        student_id: r.student_id!,
        subject_id: r.subject_id!,
        subject_name: r.subject_name ?? '',
        average: r.average ?? 0,
        grade_count: r.grade_count ?? 0,
      }));
    },
  });
};

/** Media generală per student - din view/RPC */
export const useGeneralAveragesForScope = (studentIds: string[]) => {
  return useQuery({
    queryKey: ['general-averages', studentIds],
    enabled: studentIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      if (studentIds.length === 0) return {};
      const { data, error } = await supabase
        .from('v_student_general_averages')
        .select('student_id, general_average')
        .in('student_id', studentIds);
      if (error) throw error;
      const results: Record<string, number> = {};
      (data ?? []).forEach(r => {
        if (r.student_id) results[r.student_id] = r.general_average ?? 0;
      });
      return results;
    },
  });
};

export type AttendanceRow = {
  id: string;
  date: string;
  status: string;
  subject: { id: string; name: string; teacher_id: string | null } | null;
};

export const useAttendanceForScope = (studentIds: string[]) => {
  return useQuery({
    queryKey: ['attendance', studentIds],
    enabled: studentIds.length > 0,
    queryFn: async (): Promise<AttendanceRow[]> => {
      const res = await supabase
        .from('attendance')
        .select('id,date,status, subject:subjects(id,name,teacher_id)')
        .in('student_id', studentIds)
        .order('date', { ascending: false });
      return assertSupabaseOk(res, 'attendance.select');
    },
  });
};
