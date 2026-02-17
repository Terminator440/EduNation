import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/hooks/useAuth";
import { handleServiceError, showSuccessMessage } from "@/lib/error-handler";

export async function signUpUser(
  email: string,
  password: string,
  fullName: string,
  role: AppRole,
  phone?: string | null
): Promise<void> {
  try {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName, role, phone: phone ?? null },
      },
    });
    if (error) {
      handleServiceError(error, "Înregistrare utilizator");
      throw error;
    }
    showSuccessMessage("Cont creat cu succes", "Verifică email-ul pentru confirmare.");
  } catch (error) {
    handleServiceError(error, "Înregistrare utilizator");
    throw error;
  }
}

export async function signInUser(email: string, password: string): Promise<void> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      handleServiceError(error, "Autentificare");
      throw error;
    }
    showSuccessMessage("Autentificare reușită", "Bun venit!");
  } catch (error) {
    handleServiceError(error, "Autentificare");
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      handleServiceError(error, "Deconectare");
      throw error;
    }
    showSuccessMessage("Deconectare reușită", "La revedere!");
  } catch (error) {
    handleServiceError(error, "Deconectare");
    throw error;
  }
}

export async function updateActiveRole(userId: string, role: AppRole): Promise<void> {
  try {
    const { error } = await supabase.from("profiles").update({ active_role: role }).eq("id", userId);
    if (error) {
      handleServiceError(error, "Actualizare rol");
      throw error;
    }
    showSuccessMessage("Rol actualizat", `Rolul a fost schimbat cu succes.`);
  } catch (error) {
    handleServiceError(error, "Actualizare rol");
    throw error;
  }
}

export async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) {
      handleServiceError(error, "Încărcare roluri");
      throw error;
    }
    if (!data) return [];
    return data
      .map((r) => r.role)
      .filter((role): role is AppRole => 
        typeof role === 'string' && 
        ['student', 'parent', 'teacher', 'homeroom_teacher', 'secretariat', 'director', 'uat_admin', 'developer'].includes(role)
      );
  } catch (error) {
    handleServiceError(error, "Încărcare roluri");
    throw error;
  }
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      handleServiceError(error, "Încărcare profil");
      throw error;
    }
    return data;
  } catch (error) {
    handleServiceError(error, "Încărcare profil");
    throw error;
  }
}
