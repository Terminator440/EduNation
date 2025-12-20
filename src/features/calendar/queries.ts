import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { assertSupabaseOk } from '@/lib/supabase-helpers';

export type SchoolEventRow = {
  id: string;
  event_date: string;
  event_time: string | null;
  type: 'test' | 'homework' | 'event' | 'holiday';
  title: string;
  subject: string | null;
  description: string | null;
  class_id: string | null;
};

export const useSchoolEventsForMonth = (year: number, monthIndex0: number) => {
  // monthIndex0: 0..11
  const start = new Date(year, monthIndex0, 1);
  const end = new Date(year, monthIndex0 + 1, 1);

  return useQuery({
    queryKey: ['school-events', year, monthIndex0],
    queryFn: async (): Promise<SchoolEventRow[]> => {
      const res = await supabase
        .from('school_events')
        .select('id,event_date,event_time,type,title,subject,description,class_id')
        .gte('event_date', format(start, 'yyyy-MM-dd'))
        .lt('event_date', format(end, 'yyyy-MM-dd'))
        .order('event_date', { ascending: true });
      return assertSupabaseOk(res, 'school_events.select');
    },
  });
};

export type LessonRow = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  lesson_date: string;
  status: 'planned' | 'in-progress' | 'completed';
  subject: { id: string; name: string } | null;
};

export const useLessonsForCurrentUser = (role: string | null, userId: string | null) => {
  return useQuery({
    queryKey: ['lessons', role, userId],
    enabled: Boolean(role && userId),
    queryFn: async (): Promise<LessonRow[]> => {
      if (!role || !userId) return [];

      if (role === 'student') {
        const s = await supabase.from('students').select('class_id').eq('user_id', userId).limit(1).maybeSingle();
        const student = assertSupabaseOk(s, 'students.select(class_id)');
        if (!student?.class_id) return [];
        const res = await supabase
          .from('lessons')
          .select('id,class_id,title,description,lesson_date,status, subject:subjects(id,name)')
          .eq('class_id', student.class_id)
          .order('lesson_date', { ascending: false });
        return assertSupabaseOk(res, 'lessons.select(student)');
      }

      if (role === 'parent') {
        // Get linked classes, then fetch lessons for those classes
        const rel = await supabase
          .from('parent_student_relations')
          .select('student:students(class_id)')
          .eq('parent_user_id', userId);
        const rows = assertSupabaseOk(rel, 'parent_student_relations.select(classes)') as any[];
        const classIds = Array.from(new Set((rows || []).map(r => r.student?.class_id).filter(Boolean)));
        if (classIds.length === 0) return [];
        const res = await supabase
          .from('lessons')
          .select('id,class_id,title,description,lesson_date,status, subject:subjects(id,name)')
          .in('class_id', classIds)
          .order('lesson_date', { ascending: false });
        return assertSupabaseOk(res, 'lessons.select(parent)');
      }

      if (role === 'teacher' || role === 'homeroom_teacher') {
        const c = await supabase.from('classes').select('id').eq('teacher_id', userId);
        const classes = assertSupabaseOk(c, 'classes.select(teacher)') as any[];
        const classIds = (classes || []).map(r => r.id);
        if (classIds.length === 0) return [];
        const res = await supabase
          .from('lessons')
          .select('id,class_id,title,description,lesson_date,status, subject:subjects(id,name)')
          .in('class_id', classIds)
          .order('lesson_date', { ascending: false });
        return assertSupabaseOk(res, 'lessons.select(teacher)');
      }

      // secretariat/director can see everything via RLS
      const res = await supabase
        .from('lessons')
        .select('id,class_id,title,description,lesson_date,status, subject:subjects(id,name)')
        .order('lesson_date', { ascending: false });
      return assertSupabaseOk(res, 'lessons.select(staff)');
    },
  });
};
