/**
 * Feature flags per școală. Citește din school_features; dacă nu există înregistrare, considerăm enabled (default).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSchool } from "@/hooks/useSchool";

export type FeatureName = "timetable" | "reports_pdf" | "bulk_grades" | "student_import_csv" | "billing";

/**
 * Verifică dacă un feature este activat pentru școala curentă.
 * Dacă școala nu are înregistrare în school_features pentru acel feature, returnează true (default on).
 */
export function useFeatureFlag(featureName: FeatureName): boolean {
  const { schoolId } = useSchool();

  const { data: enabled } = useQuery({
    queryKey: ["feature-flag", schoolId, featureName],
    queryFn: async (): Promise<boolean> => {
      if (!schoolId) return true;
      const { data: feature } = await supabase
        .from("features")
        .select("id")
        .eq("name", featureName)
        .maybeSingle();
      if (!feature?.id) return true;
      const { data: sf } = await supabase
        .from("school_features")
        .select("enabled")
        .eq("school_id", schoolId)
        .eq("feature_id", feature.id)
        .maybeSingle();
      return sf?.enabled ?? true;
    },
    enabled: !!schoolId,
  });

  return enabled ?? true;
}
