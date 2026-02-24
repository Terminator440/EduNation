/**
 * School year management: list, create, activate, archive, promote students.
 * Uses existing school_years table (label, start_date, end_date) + school_id, is_active.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { handleServiceError } from "@/lib/error-handler";

export type SchoolYearRow = {
  id: string;
  school_id: string | null;
  label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed?: boolean;
  closed_at?: string | null;
  created_at?: string;
};

/**
 * GET /school-years: list years for current school (or all for super admin).
 */
export async function fetchSchoolYears(schoolId?: string | null): Promise<SchoolYearRow[]> {
  const sid = schoolId ?? (await getCurrentUserSchoolId());
  let q = supabase
    .from("school_years")
    .select("id, school_id, label, start_date, end_date, is_active, is_closed, closed_at, created_at")
    .order("start_date", { ascending: false });
  if (sid) q = q.eq("school_id", sid);
  const { data, error } = await q;
  if (error) {
    handleServiceError(error, "Listă ani școlari");
    throw error;
  }
  return (data ?? []) as SchoolYearRow[];
}

/**
 * POST /school-years: create a new school year.
 */
export async function createSchoolYear(payload: {
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
}): Promise<SchoolYearRow> {
  const { data, error } = await supabase
    .from("school_years")
    .insert({
      school_id: payload.school_id,
      label: payload.name,
      start_date: payload.start_date,
      end_date: payload.end_date,
      is_active: false,
    } as Record<string, unknown>)
    .select("id, school_id, label, start_date, end_date, is_active, created_at")
    .single();
  if (error) {
    handleServiceError(error, "Creare an școlar");
    throw error;
  }
  return data as SchoolYearRow;
}

/**
 * PATCH /school-years/:id/activate: set this year as active (one per school).
 */
export async function activateSchoolYear(schoolYearId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("school_years_activate", {
    p_school_year_id: schoolYearId,
  });
  if (error) {
    handleServiceError(error, "Activare an școlar");
    throw error;
  }
  return data === true;
}

/**
 * POST /school-years/:id/archive: deactivate (archive) year.
 */
export async function archiveSchoolYear(schoolYearId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("school_years_archive", {
    p_school_year_id: schoolYearId,
  });
  if (error) {
    handleServiceError(error, "Arhivare an școlar");
    throw error;
  }
  return data === true;
}

/**
 * POST /school-years/:id/promote-students: run promotion (9A→10A, create next class if missing; grade 12 = graduated).
 */
export async function promoteStudents(schoolYearId: string): Promise<{ success: boolean; promoted_count?: number; error?: string }> {
  const { data, error } = await supabase.rpc("school_years_promote_students", {
    p_school_year_id: schoolYearId,
  });
  if (error) {
    handleServiceError(error, "Promovare elevi");
    throw error;
  }
  const result = data as { success: boolean; promoted_count?: number; error?: string } | null;
  return result ?? { success: false, error: "Unknown" };
}

/**
 * Archive current active year, create next year, activate it (one active per school).
 * Use before or with promotion: archive → create new year → set active.
 */
export async function archiveCurrentYearAndCreateNext(
  schoolId: string,
  nextLabel: string,
  nextStartDate: string,
  nextEndDate: string
): Promise<SchoolYearRow> {
  const years = await fetchSchoolYears(schoolId);
  const active = years.find((y) => y.is_active);
  if (active) {
    await archiveSchoolYear(active.id);
  }
  const newYear = await createSchoolYear({
    school_id: schoolId,
    name: nextLabel,
    start_date: nextStartDate,
    end_date: nextEndDate,
  });
  await activateSchoolYear(newYear.id);
  return newYear;
}
