import { handleServiceError } from './error-handler';

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
    handleServiceError(result.error, context);
    throw new Error(`Eroare la comunicarea cu serverul (${context}).`);
  }
  return result.data;
};
