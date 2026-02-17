import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useAuth";

export async function signUpUser(
  email: string,
  password: string,
  fullName: string,
  role: AppRole,
  phone?: string | null
) {
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

export async function signInUser(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOutUser() {
  await supabase.auth.signOut();
}

export async function updateActiveRole(userId: string, role: AppRole) {
  await supabase.from("profiles").update({ active_role: role }).eq("id", userId);
}

export async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (data || []).map((r) => r.role as AppRole);
}

export async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
}
