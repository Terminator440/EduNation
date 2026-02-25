import { z } from "zod";

const appRoleSchema = z.enum(["teacher", "student", "parent", "director", "homeroom_teacher", "secretariat"]);

export const assignRoleSchema = z.object({
  user_id: z.string().uuid("ID utilizator invalid"),
  role: appRoleSchema,
});

export const removeRoleSchema = z.object({
  user_id: z.string().uuid("ID utilizator invalid"),
  role: appRoleSchema,
});

export const createUserInviteSchema = z.object({
  email: z.string().email("Email invalid").max(255).transform((s) => s.trim().toLowerCase()),
  full_name: z.string().min(1, "Numele este obligatoriu").max(200).transform((s) => s.trim()),
  phone: z.string().max(20).nullable().optional().transform((s) => s?.trim() || null),
  role: z.enum(["teacher", "student", "parent"]),
  class_id: z.string().uuid().nullable().optional(),
  student_id: z.string().uuid().nullable().optional(),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type RemoveRoleInput = z.infer<typeof removeRoleSchema>;
export type CreateUserInviteInput = z.infer<typeof createUserInviteSchema>;
