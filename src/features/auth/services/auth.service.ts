import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/hooks/useAuth";

export async function signUpUser(
  email: string,
  password: string,
  fullName: string,
  role: AppRole,
  phone?: string | null
): Promise<void> {
  const redirectUrl = `${window.location.origin}/`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: { full_name: fullName, role, phone: phone ?? null },
    },
  });
  if (error) throw error;
}

export async function signInUser(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut();
}

export async function updateActiveRole(userId: string, role: AppRole): Promise<void> {
  await supabase.from("profiles").update({ active_role: role }).eq("id", userId);
}

export async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!data) return [];
  return data
    .map((r) => r.role)
    .filter((role): role is AppRole => 
      typeof role === 'string' && 
      ['student', 'parent', 'teacher', 'homeroom_teacher', 'secretariat', 'director', 'uat_admin', 'developer'].includes(role)
    );
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
}
