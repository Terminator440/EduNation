import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STABLE_CACHE_TIMES } from "@/lib/query-client";

export type SubjectRow = { id: string; name: string };

/**
 * Fetches the list of subjects for a school. Aggressively cached and persisted
 * for offline read-only support. Use this when you need the full subject list
 * for the current school (e.g. headers, selectors, reports).
 */
export function useSubjectsForSchool(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: ["subjects-list", schoolId],
    queryFn: async (): Promise<SubjectRow[]> => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId)
        .order("name");
      if (error) {
        console.error("Error fetching subjects:", error);
        return [];
      }
      return (data ?? []) as SubjectRow[];
    },
    enabled: !!schoolId,
    ...STABLE_CACHE_TIMES,
    meta: { persist: true },
  });
}
