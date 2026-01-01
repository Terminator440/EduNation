import { useQuery } from '@tanstack/react-query';

// Types for future implementation when tables exist
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

// Stub: returns empty array until school_events table is created
export const useSchoolEventsForMonth = (_year: number, _monthIndex0: number) => {
  return useQuery({
    queryKey: ['school-events', _year, _monthIndex0],
    queryFn: async (): Promise<SchoolEventRow[]> => {
      // Table does not exist yet - return empty
      return [];
    },
  });
};

// Stub: returns empty array until lessons table is created
export const useLessonsForCurrentUser = (_role: string | null, _userId: string | null) => {
  return useQuery({
    queryKey: ['lessons', _role, _userId],
    enabled: Boolean(_role && _userId),
    queryFn: async (): Promise<LessonRow[]> => {
      // Table does not exist yet - return empty
      return [];
    },
  });
};
