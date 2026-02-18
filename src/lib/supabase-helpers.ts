import { handleServiceError } from './error-handler';
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
    handleServiceError(result.error, context);
    throw new Error(`Eroare la comunicarea cu serverul (${context}).`);
  }
  return result.data;
};

/**
 * Get the current user's school_id from their profile.
 * Returns null if user is not authenticated or has no school_id.
 */
export async function getCurrentUserSchoolId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', user.id)
      .maybeSingle();

    return profile?.school_id ?? null;
  } catch (error) {
    console.error('Error getting current user school_id:', error);
    return null;
  }
}

/**
 * Helper to add school_id filter to a Supabase query builder.
 * Automatically filters by the current user's school_id.
 */
export async function withSchoolIdFilter<T>(
  queryBuilder: any,
  schoolId: string | null | undefined
): Promise<any> {
  if (schoolId) {
    return queryBuilder.eq('school_id', schoolId);
  }
  // If schoolId not provided, try to get it from current user
  const currentSchoolId = await getCurrentUserSchoolId();
  if (currentSchoolId) {
    return queryBuilder.eq('school_id', currentSchoolId);
  }
  // If still no school_id, return query as-is (will be filtered by RLS)
  return queryBuilder;
}
