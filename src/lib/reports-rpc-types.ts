/**
 * TypeScript interfaces for Reports RPC return data.
 * Temporary: use until Supabase types are regenerated.
 *
 * Sync with remote DB:
 *   npx supabase gen types typescript --project-id nhdjswrnlcfomfdyeadk > src/integrations/supabase/types.ts
 */

/** Matches get_class_stats_for_display RPC return. student_name comes from students.full_name. */
export interface ClassStatsForDisplayRow {
  student_id: string;
  student_name?: string | null;
  general_average: number | null;
  absences_count: number;
}

export interface ClassTotalsForDisplayRow {
  class_average: number | null;
  total_absences: number;
  total_motivated: number;
}
