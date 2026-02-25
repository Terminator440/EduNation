import { handleServiceError } from './error-handler';
import { logError } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { toFriendlySupabaseError } from '@/utils/supabaseErrors';
import { supabase } from '@/integrations/supabase/client';

/**
 * Small helper to keep error handling consistent.
 * Logs error, shows toast, throws AppError so callers can handle.
 */
export const assertSupabaseOk = <T>(
  result: { data: T; error: unknown | null },
  context: string
): T => {
  if (result.error) {
    logError("Supabase error", result.error, { context });
    handleServiceError(result.error, context);
    const message = toFriendlySupabaseError(result.error);
    const code = result.error != null && typeof result.error === "object" && "code" in result.error
      ? String((result.error as { code?: string }).code)
      : undefined;
    throw new AppError(message, { code, context, cause: result.error });
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
 * @deprecated This function is not used and may be removed in the future.
 */
export async function withSchoolIdFilter(
  queryBuilder: unknown,
  schoolId: string | null | undefined
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = queryBuilder as any;
  if (schoolId && builder?.eq) {
    return builder.eq('school_id', schoolId);
  }
  // If schoolId not provided, try to get it from current user
  const currentSchoolId = await getCurrentUserSchoolId();
  if (currentSchoolId && builder?.eq) {
    return builder.eq('school_id', currentSchoolId);
  }
  // If still no school_id, return query as-is (will be filtered by RLS)
  return queryBuilder;
}
