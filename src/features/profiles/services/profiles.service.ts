/**
 * Profiles: update onboarding, etc. All DB access here.
 */
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { handleServiceError } from "@/lib/error-handler";
import { AppError } from "@/lib/errors";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

export async function getProfileSchoolId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("school_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logError("Get profile school_id", error, { context: "getProfileSchoolId" });
    handleServiceError(error, "Profil");
    throw new AppError(toFriendlySupabaseError(error), { context: "getProfileSchoolId", cause: error });
  }
  return data?.school_id ?? null;
}

export async function updateOnboardingTourCompleted(userId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_tour_completed: true })
    .eq("id", userId);
  if (error) {
    logError("Update onboarding tour", error, { context: "updateOnboardingTourCompleted" });
    handleServiceError(error, "Salvare onboarding");
    throw new AppError(toFriendlySupabaseError(error), { context: "updateOnboardingTourCompleted", cause: error });
  }
}
