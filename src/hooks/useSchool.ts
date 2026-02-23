/**
 * useSchool – Hook for multi-tenant school scope.
 * Use this to get the current user's school id and optional school details.
 * All tenant-scoped queries should use schoolId (RLS also enforces this server-side).
 */
import { useAuth } from "@/hooks/useAuth";
import { useSchoolContext } from "@/contexts/SchoolContext";

export type { School } from "@/contexts/SchoolContext";

/**
 * Returns current school id and school details.
 * Must be used inside both AuthProvider and SchoolProvider.
 */
export function useSchool() {
  const { profile } = useAuth();
  const { schoolId, school, loading, refetchSchool } = useSchoolContext();

  // schoolId comes from SchoolProvider which is fed profile?.school_id
  return {
    schoolId: schoolId ?? profile?.school_id ?? null,
    school,
    loading,
    refetchSchool,
    /** True if user is authenticated but has no school (e.g. super-admin). */
    hasNoSchool: !!profile && schoolId == null,
  };
}
