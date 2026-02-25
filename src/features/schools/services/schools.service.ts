/**
 * Schools: fetch school name, etc. All DB access here.
 */
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { handleServiceError } from "@/lib/error-handler";
import { AppError } from "@/lib/errors";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

export async function getSchoolName(schoolId: string): Promise<string> {
  const { data, error } = await supabase
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .maybeSingle();
  if (error) {
    logError("Fetch school name", error, { context: "getSchoolName" });
    handleServiceError(error, "Încărcare școală");
    throw new AppError(toFriendlySupabaseError(error), { context: "getSchoolName", cause: error });
  }
  return data?.name ?? "";
}
