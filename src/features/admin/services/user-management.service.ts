import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { handleServiceError } from "@/lib/error-handler";

export type UserWithRoles = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  school_id: string | null;
  roles: string[];
  active_role: string | null;
};

export type CreateUserInput = {
  email: string;
  full_name: string;
  phone?: string | null;
  role: "teacher" | "student" | "parent";
  class_id?: string | null;
  student_id?: string | null; // For parent role
};

/**
 * Fetch users from the current school with pagination
 */
export async function fetchUsers(
  page: number = 0,
  pageSize: number = 20,
  search?: string
): Promise<{ users: UserWithRoles[]; total: number }> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, school_id, active_role", { count: "exact" })
    .eq("school_id", schoolId)
    .order("full_name", { ascending: true });

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  // Pagination
  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data: profiles, error, count } = await query;

  if (error) {
    handleServiceError(error, "Încărcare utilizatori");
    throw error;
  }

  // Get roles for each user
  const userIds = (profiles || []).map((p) => p.id);
  const { data: rolesData } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", userIds);

  const roleMap = new Map<string, string[]>();
  (rolesData || []).forEach((r) => {
    const arr = roleMap.get(r.user_id) || [];
    arr.push(r.role);
    roleMap.set(r.user_id, arr);
  });

  const users: UserWithRoles[] = (profiles || []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    phone: p.phone,
    school_id: p.school_id,
    roles: roleMap.get(p.id) || [],
    active_role: p.active_role,
  }));

  return {
    users,
    total: count || 0,
  };
}

/**
 * Create a new user invitation (uses existing invitation system)
 */
export async function inviteUser(input: CreateUserInput): Promise<{ invitation_id: string; code: string }> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Utilizator neautentificat");
  }

  // Use existing create_invitation RPC
  const { data, error } = await supabase.rpc("create_invitation", {
    p_role: input.role as "teacher" | "student" | "parent",
    p_school_id: schoolId,
    p_class_id: input.class_id || null,
    p_student_id: input.student_id || null,
    p_first_name: input.full_name.split(" ")[0] || null,
    p_last_name: input.full_name.split(" ").slice(1).join(" ") || null,
    p_invited_email: input.email,
    p_invited_phone: input.phone || null,
    p_created_by: user.id,
    p_max_uses: 1,
    p_expires_hours: 168, // 7 days
  });

  if (error) {
    handleServiceError(error, "Creare invitație");
    throw error;
  }

  type InvitationRpcResult = {
    invitation_id: string;
    plain_code: string;
    error_message?: string;
  };

  const result = data as InvitationRpcResult[] | null;
  if (!result || result.length === 0 || result[0]?.error_message) {
    throw new Error(result?.[0]?.error_message || "Eroare la crearea invitației");
  }

  return {
    invitation_id: result[0].invitation_id,
    code: result[0].plain_code,
  };
}

/**
 * Assign a teacher to a class/subject
 */
export async function assignTeacherToSubject(
  teacherId: string,
  subjectId: string
): Promise<void> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  // Verify subject belongs to school
  const { data: subject } = await supabase
    .from("subjects")
    .select("school_id")
    .eq("id", subjectId)
    .maybeSingle();

  if (!subject || subject.school_id !== schoolId) {
    throw new Error("Materia nu aparține școlii dvs.");
  }

  const { error } = await supabase
    .from("subjects")
    .update({ teacher_id: teacherId })
    .eq("id", subjectId);

  if (error) {
    handleServiceError(error, "Asignare profesor");
    throw error;
  }
}

/**
 * Assign a student to a parent
 */
export async function assignStudentToParent(
  studentId: string,
  parentId: string,
  isPrimary: boolean = false
): Promise<void> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  // Verify student belongs to school
  const { data: student } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student || student.school_id !== schoolId) {
    throw new Error("Elevul nu aparține școlii dvs.");
  }

  const { error } = await supabase
    .from("parent_student_relations")
    .insert({
      parent_user_id: parentId,
      student_id: studentId,
      is_primary: isPrimary,
    });

  if (error) {
    // If relation already exists, update it
    if (error.code === "23505") {
      const { error: updateError } = await supabase
        .from("parent_student_relations")
        .update({ is_primary: isPrimary })
        .eq("parent_user_id", parentId)
        .eq("student_id", studentId);

      if (updateError) {
        handleServiceError(updateError, "Actualizare relație părinte-elev");
        throw updateError;
      }
    } else {
      handleServiceError(error, "Asignare părinte-elev");
      throw error;
    }
  }
}

/**
 * Remove a role from a user
 */
export async function removeUserRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);

  if (error) {
    handleServiceError(error, "Ștergere rol");
    throw error;
  }
}

/**
 * Add a role to a user
 */
export async function addUserRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role: role as "student" | "parent" | "teacher" | "homeroom_teacher" | "secretariat" | "director" | "uat_admin" })
    .select();

  if (error) {
    // If role already exists, ignore
    if (error.code !== "23505") {
      handleServiceError(error, "Adăugare rol");
      throw error;
    }
  }
}
