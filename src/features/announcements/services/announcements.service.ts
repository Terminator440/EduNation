/**
 * Announcements: create and list. All DB access here; no direct supabase in UI.
 */
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";
import { handleServiceError } from "@/lib/error-handler";
import { announcementInsertSchema } from "../schemas/announcements.schema";
import { getFirstZodMessage } from "@/lib/zod-utils";

export type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  target_role: string | null;
  created_by: string;
  created_at: string;
};

export type AnnouncementInsert = {
  title: string;
  content: string;
  target_role?: string | null;
  created_by: string;
};

export async function createAnnouncement(payload: AnnouncementInsert): Promise<AnnouncementRow> {
  const parsed = announcementInsertSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(getFirstZodMessage(parsed.error), { context: "createAnnouncement" });
  }
  const row = {
    title: parsed.data.title,
    content: parsed.data.content,
    target_role: parsed.data.target_role ?? null,
    created_by: parsed.data.created_by,
  };
  const { data, error } = await supabase.from("announcements").insert(row).select().single();
  if (error) {
    logError("Announcement insert", error, { context: "createAnnouncement" });
    handleServiceError(error, "Publicare anunț");
    throw new AppError(toFriendlySupabaseError(error), { context: "createAnnouncement", cause: error });
  }
  return data as AnnouncementRow;
}

export async function fetchAnnouncements(limit = 100): Promise<AnnouncementRow[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, content, target_role, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logError("Announcements fetch", error, { context: "fetchAnnouncements" });
    handleServiceError(error, "Încărcare anunțuri");
    throw new AppError(toFriendlySupabaseError(error), { context: "fetchAnnouncements", cause: error });
  }
  return (data ?? []) as AnnouncementRow[];
}
