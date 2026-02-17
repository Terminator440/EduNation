/**
 * Typed RPC helpers for Reports page.
 * Uses local interfaces until Supabase types are regenerated.
 * Run: npx supabase gen types typescript --project-id <PROJECT_ID> > src/integrations/supabase/types.ts
 */
import { supabase } from "@/integrations/supabase/client";
import type { ClassStatsForDisplayRow, ClassTotalsForDisplayRow } from "./reports-rpc-types";

export interface GetClassStatsParams {
  p_class_id: string;
  p_date_from: string | null;
  p_date_to: string | null;
}

export async function fetchClassStatsForDisplay(
  params: GetClassStatsParams
): Promise<{ data: ClassStatsForDisplayRow[]; error: Error | null }> {
  // RPC call - using type assertion as RPC types are complex
  const { data, error } = await supabase.rpc("get_class_stats_for_display", params) as { 
    data: ClassStatsForDisplayRow[] | null; 
    error: Error | null 
  };
  if (error) return { data: [], error: error as Error };
  return { data: (data ?? []) as ClassStatsForDisplayRow[], error: null };
}

export async function fetchClassTotalsForDisplay(
  params: GetClassStatsParams
): Promise<{ data: ClassTotalsForDisplayRow | null; error: Error | null }> {
  // RPC call - using type assertion as RPC types are complex
  const { data, error } = await supabase.rpc("get_class_totals_for_display", params) as { 
    data: ClassTotalsForDisplayRow[] | null; 
    error: Error | null 
  };
  if (error) return { data: null, error: error as Error };
  const arr = (data ?? []) as ClassTotalsForDisplayRow[];
  return { data: arr.length > 0 ? arr[0] : null, error: null };
}
