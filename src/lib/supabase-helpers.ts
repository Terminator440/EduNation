import { supabase } from '@/integrations/supabase/client';

/**
 * Small helper to keep error handling consistent.
 * We never silently ignore Supabase errors in production.
 */
export const assertSupabaseOk = <T>(
  result: { data: T; error: unknown | null },
  context: string
): T => {
  if (result.error) {
    // eslint-disable-next-line no-console
    console.error(`Supabase error in ${context}:`, result.error);
    throw new Error(`Eroare la comunicarea cu serverul (${context}).`);
  }
  return result.data;
};

export const getCurrentUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Nu ești autentificat.');
  return data.user.id;
};
