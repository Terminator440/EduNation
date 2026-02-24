/**
 * Onboarding școală: creează școală, invitație admin (director), clase, materii.
 * Pentru uat_admin / developer. RLS trebuie să permită insert pe schools pentru acești roluri.
 */
import { supabase } from "@/integrations/supabase/client";
import { handleServiceError } from "@/lib/error-handler";

export type SchoolOnboardingStep1 = {
  name: string;
  code: string;
  address?: string | null;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
};
export type SchoolOnboardingStep2 = { adminEmail: string; adminName: string };
export type SchoolOnboardingStep3 = { classNames: string[] };
export type SchoolOnboardingStep4 = { subjectNames: string[] };

export type SchoolOnboardingResult = {
  schoolId: string;
  invitationCode?: string;
  classesCreated: number;
  subjectsCreated: number;
  schoolYearCreated?: boolean;
};

/**
 * Step 1: Create school (name, code, address, type, email, phone). Returns school id.
 */
export async function createSchool(payload: SchoolOnboardingStep1): Promise<string> {
  const { data, error } = await supabase
    .from("schools")
    .insert({
      name: payload.name.trim(),
      code: payload.code.trim() || null,
      address: payload.address?.trim() || null,
      type: payload.type?.trim() || null,
      email: payload.email?.trim() || null,
      phone: payload.phone?.trim() || null,
    })
    .select("id")
    .single();
  if (error) {
    handleServiceError(error, "Creare școală");
    throw error;
  }
  if (!data?.id) throw new Error("Școala nu a fost creată");
  return data.id;
}

/**
 * Initialize current school year for a new school (one active per school).
 */
export async function initializeSchoolYear(schoolId: string): Promise<boolean> {
  const y = new Date().getFullYear();
  const name = `${y}-${y + 1}`;
  const startDate = `${y}-09-01`;
  const endDate = `${y + 1}-06-30`;
  const { error } = await supabase.from("school_years").insert({
    school_id: schoolId,
    label: name,
    start_date: startDate,
    end_date: endDate,
    is_active: true,
  } as Record<string, unknown>);
  if (error) {
    handleServiceError(error, "Inițializare an școlar");
    throw error;
  }
  return true;
}

/**
 * Step 2: Create invitation for director (admin). Uses existing invitation flow if available.
 * Returns invitation code for the admin to sign up.
 */
export async function createDirectorInvitation(
  schoolId: string,
  payload: SchoolOnboardingStep2
): Promise<{ code: string }> {
  const { data, error } = await supabase.rpc("create_invitation", {
    p_role: "director",
    p_school_id: schoolId,
    p_class_id: null,
    p_student_id: null,
    p_first_name: payload.adminName.trim().split(" ")[0] ?? payload.adminName.trim(),
    p_last_name: payload.adminName.trim().split(" ").slice(1).join(" ") || null,
    p_invited_email: payload.adminEmail.trim(),
    p_max_uses: 1,
    p_expires_hours: 168,
  });
  if (error) {
    handleServiceError(error, "Creare invitație director");
    throw error;
  }
  const rows = (data ?? []) as { plain_code?: string; error_message?: string }[];
  const first = rows[0];
  if (first?.error_message || !first?.plain_code) throw new Error(first?.error_message ?? "Invitație eșuată");
  return { code: first.plain_code };
}

/**
 * Step 3: Create classes for school.
 */
export async function createClasses(schoolId: string, classNames: string[]): Promise<number> {
  if (classNames.length === 0) return 0;
  const rows = classNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ school_id: schoolId, name, year: null, section: null }));
  if (rows.length === 0) return 0;
  const { data, error } = await supabase.from("classes").insert(rows).select("id");
  if (error) {
    handleServiceError(error, "Creare clase");
    throw error;
  }
  return data?.length ?? 0;
}

/**
 * Step 4: Create subjects for school.
 */
export async function createSubjects(schoolId: string, subjectNames: string[]): Promise<number> {
  if (subjectNames.length === 0) return 0;
  const rows = subjectNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ school_id: schoolId, name }));
  if (rows.length === 0) return 0;
  const { data, error } = await supabase.from("subjects").insert(rows).select("id");
  if (error) {
    handleServiceError(error, "Creare materii");
    throw error;
  }
  return data?.length ?? 0;
}
