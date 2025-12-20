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
  subject: { id: string; name: string; teacher_id: string | null } | null;
};

export const useGradesForScope = (studentIds: string[]) => {
  return useQuery({
    queryKey: ['grades', studentIds],
    enabled: studentIds.length > 0,
    queryFn: async (): Promise<GradeRow[]> => {
      const res = await supabase
        .from('grades')
        .select('id,date,grade,description, subject:subjects(id,name,teacher_id)')
        .in('student_id', studentIds)
        .order('date', { ascending: false });
      return assertSupabaseOk(res, 'grades.select');
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
