import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { env } from "@/lib/env";
import type { BulkImportRowValidation } from "@/lib/bulk-import-validation";

export type ValidatedRowForImport = {
  rowIndex: number;
  role: "student" | "teacher";
  email: string;
  full_name: string;
  cnp?: string | null;
  phone?: string | null;
  class_id: string | null;
};

export type BulkImportValidationResult = {
  rows: (BulkImportRowValidation & { class_id?: string; errors: string[] })[];
  validRows: ValidatedRowForImport[];
};

/**
 * Server-side validation: duplicate email in school, resolve class_identifier -> class_id.
 * Merges RPC errors into the provided client validations.
 */
export async function validateBulkImportRows(
  clientValidations: BulkImportRowValidation[],
  schoolId: string
): Promise<BulkImportValidationResult> {
  const payload = clientValidations.map((r) => ({
    rowIndex: r.rowIndex,
    email: r.email,
    full_name: r.full_name,
    role: r.role,
    class_identifier: r.class_identifier ?? null,
  }));
  const { data: rpcRows, error } = await supabase.rpc("validate_bulk_import_rows", {
    p_rows: payload,
    p_school_id: schoolId,
  });
  if (error) throw error;
  const results = (rpcRows ?? []) as { row_index: number; errors: string[]; class_id: string | null }[];
  const byIndex = new Map(
    results.map((r) => [
      r.row_index,
      { errors: r.errors ?? [], class_id: r.class_id ?? null },
    ])
  );
  const merged: BulkImportValidationResult["rows"] = clientValidations.map((r) => {
    const server = byIndex.get(r.rowIndex) ?? { errors: [], class_id: null };
    const allErrors = [...r.errors, ...server.errors];
    return {
      ...r,
      errors: allErrors,
      class_id: server.class_id ?? undefined,
    };
  });
  const validRows: ValidatedRowForImport[] = [];
  merged.forEach((m) => {
    if (m.errors.length > 0) return;
    validRows.push({
      rowIndex: m.rowIndex,
      role: m.role as "student" | "teacher",
      email: m.email,
      full_name: m.full_name,
      cnp: m.cnp ?? null,
      phone: m.phone ?? null,
      class_id: m.class_id ?? null,
    });
  });
  return { rows: merged, validRows };
}

export type BulkImportEdgeResult = {
  created: number;
  total: number;
  results: { rowIndex: number; success: boolean; error?: string; user_id?: string }[];
};

/**
 * Call the bulk-import Edge Function with validated rows. Requires auth session.
 */
export async function callBulkImportEdge(rows: ValidatedRowForImport[]): Promise<BulkImportEdgeResult> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) throw new Error("Nu aveți o școală asociată");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Trebuie să fiți autentificat");
  const url = `${env.VITE_SUPABASE_URL}/functions/v1/bulk-import`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      rows: rows.map((r) => ({
        role: r.role,
        email: r.email,
        full_name: r.full_name,
        cnp: r.cnp,
        phone: r.phone,
        class_id: r.class_id,
        rowIndex: r.rowIndex,
      })),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Eroare ${res.status}`);
  return json as BulkImportEdgeResult;
}
