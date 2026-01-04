import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Types for school events
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

export type LessonRow = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  lesson_date: string;
  status: 'planned' | 'in-progress' | 'completed';
  subject: { id: string; name: string } | null;
};

// Fetch school events for a specific month
export const useSchoolEventsForMonth = (year: number, monthIndex0: number) => {
  return useQuery({
    queryKey: ['school-events', year, monthIndex0],
    queryFn: async (): Promise<SchoolEventRow[]> => {
      // Calculate start and end dates for the month
      const startDate = new Date(year, monthIndex0, 1);
      const endDate = new Date(year, monthIndex0 + 1, 0);
      
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('school_events')
        .select('id, event_date, event_time, type, title, subject, description, class_id')
        .gte('event_date', startStr)
        .lte('event_date', endStr)
        .order('event_date');
      
      if (error) {
        // If table doesn't exist or RLS blocks, return empty
        console.warn('Could not fetch school_events:', error.message);
        return [];
      }
      
      return (data as SchoolEventRow[]) ?? [];
    },
  });
};

// Fetch lessons for current user (stub - lessons table doesn't exist yet)
export const useLessonsForCurrentUser = (_role: string | null, _userId: string | null) => {
  return useQuery({
    queryKey: ['lessons', _role, _userId],
    enabled: Boolean(_role && _userId),
    queryFn: async (): Promise<LessonRow[]> => {
      // Lessons table does not exist yet - return empty
      return [];
    },
  });
};
