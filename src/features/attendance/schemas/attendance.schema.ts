import { z } from "zod";

const statusSchema = z.enum(["present", "absent", "late", "excused"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida (AAAA-LL-ZZ)");

export const attendanceInsertSchema = z.object({
  student_id: z.string().uuid("ID elev invalid"),
  subject_id: z.string().uuid("ID materie invalid"),
  date: dateSchema.optional(),
  status: statusSchema,
  is_excused: z.boolean().optional(),
}).transform((d) => ({
  ...d,
  date: d.date ?? new Date().toISOString().split("T")[0],
  is_excused: d.is_excused ?? false,
}));

export const attendanceUpdateSchema = z.object({
  status: statusSchema.optional(),
  is_excused: z.boolean().optional(),
  date: dateSchema.optional(),
});

export type AttendanceInsertInput = z.infer<typeof attendanceInsertSchema>;
export type AttendanceUpdateInput = z.infer<typeof attendanceUpdateSchema>;
