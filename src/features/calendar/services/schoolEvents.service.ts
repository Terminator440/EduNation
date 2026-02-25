/**
 * School calendar events. All DB access here; no direct supabase in UI.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { logError } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";
import { handleServiceError } from "@/lib/error-handler";

export type EventType = "holiday" | "event" | "test" | "homework";

export type SchoolEventRow = {
  id: string;
  event_date: string;
  event_time: string | null;
  type: EventType;
  title: string;
  subject: string | null;
  description: string | null;
  class_id: string | null;
  created_by: string | null;
  created_at: string;
  school_id?: string | null;
  visibility_scope?: string | null;
  target_class_id?: string | null;
};

export type SchoolEventInsert = {
  event_date: string;
  event_time?: string | null;
  type: EventType;
  title: string;
  subject?: string | null;
  description?: string | null;
  created_by: string;
  school_id?: string | null;
};

export async function createSchoolEvent(payload: SchoolEventInsert): Promise<SchoolEventRow> {
  const schoolId = await getCurrentUserSchoolId();
  const row = {
    event_date: payload.event_date,
    event_time: payload.event_time ?? null,
    type: payload.type,
    title: payload.title.trim(),
    subject: payload.subject?.trim() || null,
    description: payload.description?.trim() || null,
    created_by: payload.created_by,
    ...(schoolId ? { school_id: schoolId } : {}),
  };
  const { data, error } = await supabase.from("school_events").insert(row).select().single();
  if (error) {
    logError("School event insert", error, { context: "createSchoolEvent" });
    handleServiceError(error, "Adăugare eveniment");
    throw new AppError(toFriendlySupabaseError(error), { context: "createSchoolEvent", cause: error });
  }
  return data as SchoolEventRow;
}

export async function fetchSchoolEvents(monthStart: string, monthEnd: string): Promise<SchoolEventRow[]> {
  const { data, error } = await supabase
    .from("school_events")
    .select("*")
    .gte("event_date", monthStart)
    .lte("event_date", monthEnd)
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true });
  if (error) {
    logError("School events fetch", error, { context: "fetchSchoolEvents" });
    handleServiceError(error, "Încărcare evenimente");
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchSchoolEvents", cause: error });
  }
  return (data ?? []) as SchoolEventRow[];
}
