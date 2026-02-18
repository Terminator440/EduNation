import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { STABLE_CACHE_TIMES } from "@/lib/query-client";

/**
 * Hook to fetch and return the school name for the current user.
 * Aggressively cached and persisted to localStorage for offline read-only support.
 */
export function useSchoolName(): string | null {
  const { profile } = useAuth();
  const schoolId = profile?.school_id;

  const { data: schoolName } = useQuery({
    queryKey: ["school-name", schoolId],
    queryFn: async (): Promise<string | null> => {
      if (!schoolId) return null;
      const { data, error } = await supabase
        .from("schools")
        .select("name")
        .eq("id", schoolId)
        .maybeSingle();
      if (error) {
        console.error("Error fetching school name:", error);
        return null;
      }
      return data?.name ?? null;
    },
    enabled: !!schoolId,
    ...STABLE_CACHE_TIMES,
    meta: { persist: true },
  });

  return schoolName ?? null;
}
