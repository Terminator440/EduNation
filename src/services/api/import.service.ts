/**
 * Import API (pseudo-API layer). Bulk import students, teachers, classes.
 * All import operations go through this; delegates to admin/feature services.
 */
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { validateBulkImportRows, callBulkImportEdge, type ValidatedRowForImport } from "@/features/admin/services/bulk-import.service";
import { validateClassesImport, importClasses } from "@/features/admin/services/classes-import.service";
import type { BulkImportRowValidation } from "@/lib/bulk-import-validation";

export type { ValidatedRowForImport };

/**
 * Import students: validate rows (client validations + server class resolution), then call Edge Function.
 */
export async function importStudents(validatedRows: ValidatedRowForImport[]): Promise<{ created: number; total: number }> {
  const result = await callBulkImportEdge(validatedRows.filter((r) => r.role === "student"));
  return { created: result.created, total: result.total };
}

/**
 * Import teachers: validate rows, then call Edge Function.
 */
export async function importTeachers(validatedRows: ValidatedRowForImport[]): Promise<{ created: number; total: number }> {
  const result = await callBulkImportEdge(validatedRows.filter((r) => r.role === "teacher"));
  return { created: result.created, total: result.total };
}

/**
 * Import classes: validate names (no duplicates, not existing), then insert.
 */
export async function importClassesApi(names: string[]): Promise<{ created: number }> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) throw new Error("Nu aveți o școală asociată");
  const validated = await validateClassesImport(names, schoolId);
  return importClasses(schoolId, validated.validNames);
}

/**
 * Validate bulk import rows (students or teachers) for current school.
 */
export async function validateBulkImport(
  clientValidations: BulkImportRowValidation[],
  schoolId: string
) {
  return validateBulkImportRows(clientValidations, schoolId);
}
