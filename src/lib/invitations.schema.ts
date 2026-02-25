import { z } from "zod";

const invitationRoleSchema = z.enum(["director", "teacher", "homeroom_teacher", "secretariat", "student", "parent"]);

/** Payload for creating an invitation (UI + service validation). */
export const createInvitationSchema = z.object({
  role: invitationRoleSchema,
  school_id: z.string().uuid("ID școală invalid"),
  class_id: z.string().uuid().nullable().optional(),
  student_id: z.string().uuid().nullable().optional(),
  first_name: z.string().max(100).nullable().optional(),
  last_name: z.string().max(100).nullable().optional(),
  invited_email: z.string().email("Email invalid").max(255).optional().nullable(),
  invited_phone: z.string().max(20).nullable().optional(),
  created_by: z.string().uuid("ID utilizator invalid"),
  max_uses: z.number().int().min(1).max(100).optional(),
  expires_hours: z.number().int().min(1).max(8760).optional(),
}).transform((d) => ({
  ...d,
  first_name: d.first_name?.trim() ?? null,
  last_name: d.last_name?.trim() ?? null,
  invited_email: d.invited_email?.trim().toLowerCase() ?? null,
  invited_phone: d.invited_phone?.trim() || null,
  max_uses: d.max_uses ?? 1,
  expires_hours: d.expires_hours ?? 168,
}));

/** Code entered by user (normalize before hash). */
export const invitationCodeSchema = z.string().min(1, "Codul este obligatoriu").max(50).transform((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""));

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
