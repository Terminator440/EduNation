/**
 * Import clase din CSV: validare (nume unic per școală) și insert.
 * Extinde fluxul de import; nu duplică BulkImport.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { handleServiceError } from "@/lib/error-handler";

export type ClassImportRow = { rowIndex: number; name: string; errors: string[] };

export type ClassesImportValidationResult = {
  rows: ClassImportRow[];
  validNames: string[];
};

/**
 * Validate class names: non-empty, trim, no duplicates in list, optionally check existing in DB.
 */
export async function validateClassesImport(
  names: string[],
  schoolId: string
): Promise<ClassesImportValidationResult> {
  const seen = new Set<string>();
  const rows: ClassImportRow[] = [];
  const validNames: string[] = [];

  const { data: existing } = await supabase
    .from("classes")
    .select("name")
    .eq("school_id", schoolId);
  const existingNames = new Set((existing ?? []).map((r: { name: string }) => r.name.trim().toLowerCase()));

  names.forEach((raw, rowIndex) => {
    const name = raw.trim();
    const errors: string[] = [];
    if (!name) errors.push("Nume clasă lipsă");
    if (seen.has(name.toLowerCase())) errors.push("Duplicat în fișier");
    if (existingNames.has(name.toLowerCase())) errors.push("Clasa există deja în școală");
    seen.add(name.toLowerCase());
    rows.push({ rowIndex, name, errors });
    if (errors.length === 0) validNames.push(name);
  });

  return { rows, validNames };
}

/**
 * Insert validated class names into classes table.
 */
export async function importClasses(schoolId: string, names: string[]): Promise<{ created: number }> {
  if (names.length === 0) return { created: 0 };
  const rows = names.map((name) => ({ school_id: schoolId, name, year: null, section: null }));
  const { data, error } = await supabase.from("classes").insert(rows).select("id");
  if (error) {
    handleServiceError(error, "Import clase");
    throw error;
  }
  return { created: data?.length ?? 0 };
}
