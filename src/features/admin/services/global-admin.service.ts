/**
 * Global admin service – list schools, global stats.
 * For uat_admin / developer only; RLS must restrict schools list to admins.
 */
import { supabase } from "@/integrations/supabase/client";
import { handleServiceError } from "@/lib/error-handler";
import { logError } from "@/lib/logger";

export type SchoolListItem = {
  id: string;
  name: string;
  code: string | null;
  created_at: string;
  user_count: number;
  class_count: number;
  student_count: number;
};

/**
 * Fetch all schools with basic counts (for global admin panel).
 * Requires RLS to allow only uat_admin/developer.
 */
export async function fetchSchoolsForGlobalAdmin(): Promise<SchoolListItem[]> {
  const { data: schools, error: schoolsError } = await supabase
    .from("schools")
    .select("id, name, code, created_at")
    .order("name", { ascending: true });

  if (schoolsError) {
    logError("Global admin: fetch schools failed", schoolsError, {});
    handleServiceError(schoolsError, "Listă școli");
    throw schoolsError;
  }

  if (!schools?.length) return [];

  const ids = schools.map((s) => s.id);

  const [profilesRes, classesRes, studentsRes] = await Promise.all([
    supabase.from("profiles").select("school_id").in("school_id", ids),
    supabase.from("classes").select("school_id").in("school_id", ids),
    supabase.from("students").select("school_id").in("school_id", ids),
  ]);

  const countBy = (arr: { school_id: string }[] | null, key: string): Record<string, number> => {
    const out: Record<string, number> = {};
    (arr ?? []).forEach((r) => {
      const id = r[key];
      if (id) out[id] = (out[id] ?? 0) + 1;
    });
    return out;
  };

  const profileCount = countBy(profilesRes.data ?? null, "school_id");
  const classCount = countBy(classesRes.data ?? null, "school_id");
  const studentCount = countBy(studentsRes.data ?? null, "school_id");

  return schools.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    created_at: s.created_at,
    user_count: profileCount[s.id] ?? 0,
    class_count: classCount[s.id] ?? 0,
    student_count: studentCount[s.id] ?? 0,
  }));
}

export type GlobalStats = {
  schools: number;
  users: number;
  classes: number;
  students: number;
  grades: number;
  attendance: number;
};

export type UserWithRolesRow = {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
};

/**
 * Fetch all users with roles (for global admin panel). No school filter.
 */
const ADMIN_USERS_LIMIT = 500;

export async function fetchAllUsersForAdmin(): Promise<UserWithRolesRow[]> {
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name", { ascending: true })
    .limit(ADMIN_USERS_LIMIT);
  if (pErr) {
    logError("Admin: fetch profiles failed", pErr, {});
    handleServiceError(pErr, "Listă utilizatori");
    throw pErr;
  }
  if (!profiles?.length) return [];
  const { data: rolesData, error: rErr } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", profiles.map((p) => p.id));
  if (rErr) {
    logError("Admin: fetch roles failed", rErr, {});
    handleServiceError(rErr, "Listă roluri");
    throw rErr;
  }
  const roleMap = new Map<string, string[]>();
  (rolesData ?? []).forEach((r: { user_id: string; role: string }) => {
    const arr = roleMap.get(r.user_id) ?? [];
    if (r.role !== "developer") arr.push(r.role);
    roleMap.set(r.user_id, arr);
  });
  return profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    roles: roleMap.get(p.id) ?? [],
  }));
}

/**
 * Global statistics (all tenants). For uat_admin/developer dashboard.
 */
export async function fetchGlobalStats(): Promise<GlobalStats> {
  const [schools, profiles, classes, students, grades, attendance] = await Promise.all([
    supabase.from("schools").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("classes").select("id", { count: "exact", head: true }),
    supabase.from("students").select("id", { count: "exact", head: true }),
    supabase.from("grades").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("attendance").select("id", { count: "exact", head: true }),
  ]);

  return {
    schools: schools.count ?? 0,
    users: profiles.count ?? 0,
    classes: classes.count ?? 0,
    students: students.count ?? 0,
    grades: grades.count ?? 0,
    attendance: attendance.count ?? 0,
  };
}
