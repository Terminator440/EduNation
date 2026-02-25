import { z } from "zod";

/** Grade value: integer 1-10 */
const gradeValueSchema = z.number().int().min(1).max(10);

/** ISO date string YYYY-MM-DD */
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida (folositi AAAA-LL-ZZ)");

export const gradeInsertSchema = z.object({
  student_id: z.string().uuid("ID elev invalid"),
  subject_id: z.string().uuid("ID materie invalid"),
  grade: gradeValueSchema,
  date: dateSchema.optional(),
  description: z.string().max(500).nullable().optional(),
}).transform((d) => ({
  ...d,
  date: d.date ?? new Date().toISOString().split("T")[0],
  description: d.description ?? null,
}));

export const gradeUpdateSchema = z.object({
  grade: gradeValueSchema.optional(),
  date: dateSchema.optional(),
  description: z.string().max(500).nullable().optional(),
});

export type GradeInsertInput = z.infer<typeof gradeInsertSchema>;
export type GradeUpdateInput = z.infer<typeof gradeUpdateSchema>;
