/**
 * GDPR: export date utilizator și ștergere cont (soft delete).
 * Apeluri către RPC-uri Supabase; nu șterge efectiv din auth.users.
 */
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";

export type ExportDataResult = {
  exported_at?: string;
  profile?: Record<string, unknown>;
  roles?: string[];
  grades?: unknown[];
  attendance?: unknown[];
  error?: string;
};

/**
 * Exportă datele personale ale utilizatorului curent (GDPR drept la portabilitate).
 */
export async function exportMyData(): Promise<ExportDataResult> {
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) {
    logError("GDPR export failed", error, {});
    throw error;
  }
  const raw = data as ExportDataResult | null;
  if (raw?.error) {
    throw new Error(raw.error as string);
  }
  return raw ?? {};
}

/**
 * Șterge contul curent (soft delete: anonimizare profile, set deleted_at).
 * După apel, utilizatorul ar trebui deconectat; auth.users rămâne (revocare manuală sau cron).
 */
export async function softDeleteMyAccount(): Promise<{ success: boolean }> {
  const { data, error } = await supabase.rpc("soft_delete_my_account");
  if (error) {
    logError("GDPR soft delete account failed", error, {});
    throw error;
  }
  const result = data as { success?: boolean; error?: string } | null;
  if (result?.error) {
    throw new Error(result.error);
  }
  return { success: result?.success ?? true };
}
