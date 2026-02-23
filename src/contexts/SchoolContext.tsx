/**
 * SchoolContext – Multi-tenant context for SaaS catalog.
 * Each user belongs to one school (profile.school_id). All data is scoped by school_id.
 * RLS policies in Supabase enforce school isolation; this context provides schoolId for UI and optional school details.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export type School = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

type SchoolContextType = {
  /** Current user's school id from profile. Null if not set or not authenticated. */
  schoolId: string | null;
  /** Full school record; null until fetched or if no school. */
  school: School | null;
  /** True while loading school details (schoolId may already be available from profile). */
  loading: boolean;
  /** Refetch school details (e.g. after profile update). */
  refetchSchool: () => Promise<void>;
};

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export function SchoolProvider({
  children,
  schoolIdFromProfile,
}: {
  children: ReactNode;
  /** School id from profile (e.g. from useAuth().profile?.school_id). Pass null when not authenticated. */
  schoolIdFromProfile: string | null | undefined;
}) {
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSchool = async () => {
    if (!schoolIdFromProfile) {
      setSchool(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, code, address, phone, email, created_at, updated_at")
        .eq("id", schoolIdFromProfile)
        .maybeSingle();
      if (error) {
        console.error("[SchoolContext] Error fetching school:", error);
        setSchool(null);
      } else {
        setSchool(data as School | null);
      }
    } catch (e) {
      console.error("[SchoolContext] Error fetching school:", e);
      setSchool(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchool();
  }, [schoolIdFromProfile]);

  const value = useMemo<SchoolContextType>(
    () => ({
      schoolId: schoolIdFromProfile ?? null,
      school,
      loading,
      refetchSchool: fetchSchool,
    }),
    [schoolIdFromProfile, school, loading]
  );

  return (
    <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>
  );
}

export function useSchoolContext(): SchoolContextType {
  const ctx = useContext(SchoolContext);
  if (ctx === undefined) {
    throw new Error("useSchoolContext must be used within a SchoolProvider");
  }
  return ctx;
}
