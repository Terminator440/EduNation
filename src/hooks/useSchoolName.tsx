import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Hook to fetch and return the school name for the current user.
 * Returns the school name from the schools table based on the user's profile school_id.
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
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  return schoolName ?? null;
}
