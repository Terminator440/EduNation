import { z } from "zod";

export const announcementInsertSchema = z.object({
  title: z.string().min(1, "Titlul este obligatoriu").max(500).transform((s) => s.trim()),
  content: z.string().min(1, "Conținutul este obligatoriu").max(10000).transform((s) => s.trim()),
  target_role: z.string().nullable().optional(),
  created_by: z.string().uuid("ID utilizator invalid"),
});

export type AnnouncementInsertInput = z.infer<typeof announcementInsertSchema>;
