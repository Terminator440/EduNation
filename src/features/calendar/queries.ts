import { useQuery } from '@tanstack/react-query';
import { fetchSchoolEvents, type SchoolEventRow } from './services/schoolEvents.service';

export type { SchoolEventRow };

export type LessonRow = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  lesson_date: string;
  status: 'planned' | 'in-progress' | 'completed';
  subject: { id: string; name: string } | null;
};

// Fetch school events for a specific month via service (no direct supabase in UI)
export const useSchoolEventsForMonth = (year: number, monthIndex0: number) => {
  const startDate = new Date(year, monthIndex0, 1);
  const endDate = new Date(year, monthIndex0 + 1, 0);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  return useQuery({
    queryKey: ['school-events', year, monthIndex0],
    queryFn: () => fetchSchoolEvents(startStr, endStr),
  });
};

/**
 * @planned - urmează să fie integrat cu Tabelul Lessons
 */
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
