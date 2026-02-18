import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "student"
  | "parent"
  | "teacher"
  | "homeroom_teacher"
  | "secretariat"
  | "director"
  | "uat_admin"
  | "developer";

const ALL_ROLES: AppRole[] = [
  "student",
  "parent",
  "teacher",
  "homeroom_teacher",
  "secretariat",
  "director",
  "uat_admin",
  "developer",
];

const normalizeRole = (value: unknown): AppRole | null => {
  if (typeof value !== "string") return null;
  return (ALL_ROLES as string[]).includes(value) ? (value as AppRole) : null;
};

const safeStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

const PROFILE_CACHE_KEY = "edunation.profile";

function getCachedProfile(userId: string): Profile | null {
  const raw = safeStorageGet(PROFILE_CACHE_KEY);
  if (!raw) return null;
  try {
    const { userId: cachedUserId, profile: cached } = JSON.parse(raw) as {
      userId: string;
      profile: Profile;
    };
    return cachedUserId === userId && cached ? cached : null;
  } catch {
    return null;
  }
}

function setCachedProfile(userId: string, profileData: Profile | null): void {
  if (!profileData) return;
  safeStorageSet(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile: profileData }));
}

const BOOTSTRAP_ADMIN_EMAILS =
  (import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAILS as string | undefined)
    ?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) ?? [];

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  active_role: AppRole | null;
  school_id?: string | null;
  onboarding_tour_completed?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userRoles: AppRole[];
  activeRole: AppRole | null;
  loading: boolean;
  refetchProfile: () => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: AppRole,
    phone?: string | null
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  switchRole: (role: AppRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRoles, setUserRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        setTimeout(() => {
          fetchUserData(nextSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setUserRoles([]);
        setActiveRole(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      if (existingSession?.user) {
        fetchUserData(existingSession.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    const cachedProfile = getCachedProfile(userId);
    if (cachedProfile) setProfile(cachedProfile);

    try {
      const { data: authUserRes } = await supabase.auth.getUser();
      const authUser = authUserRes.user;

      let { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!profileData && authUser) {
        const fullName =
          (authUser.user_metadata?.full_name as string | undefined) ?? "";
        const email = authUser.email ?? "";

        const { data: createdProfile } = await supabase
          .from("profiles")
          .upsert(
            { id: userId, full_name: fullName, email, active_role: null },
            { onConflict: "id" }
          )
          .select("*")
          .maybeSingle();

        if (createdProfile) profileData = createdProfile;
      }

      const profileToSet = profileData as Profile | null;
      setProfile(profileToSet);
      if (profileToSet) setCachedProfile(userId, profileToSet);

      if (profileData?.active_role) {
        setActiveRole(profileData.active_role as AppRole);
      }

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const roles = (rolesData || []).map((r) => r.role as AppRole);

      const metaRole = authUser
        ? normalizeRole(authUser.user_metadata?.role) ??
          (BOOTSTRAP_ADMIN_EMAILS.includes((authUser.email ?? "").toLowerCase())
            ? "uat_admin"
            : null)
        : null;

      const effectiveRoles: AppRole[] =
        roles.length > 0 ? roles : metaRole ? [metaRole] : [];

      if (roles.length === 0 && metaRole) {
        try {
          await supabase.from("user_roles").insert({ user_id: userId, role: metaRole });
        } catch {
          /* ignore */
        }
      }

      setUserRoles(effectiveRoles);

      const dbActive = (profileData?.active_role as AppRole | null) ?? null;
      const storedRoleRaw = safeStorageGet("edunation.activeRole");
      const storedRole = normalizeRole(storedRoleRaw);

      const pick =
        (storedRole && effectiveRoles.includes(storedRole) ? storedRole : null) ??
        (dbActive && effectiveRoles.includes(dbActive) ? dbActive : null) ??
        (effectiveRoles.length > 0 ? effectiveRoles[0] : null);

      if (pick) {
        setActiveRole(pick);
        safeStorageSet("edunation.activeRole", pick);

        try {
          await supabase
            .from("profiles")
            .update({ active_role: pick })
            .eq("id", userId);
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      if (!cachedProfile) setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: AppRole,
    phone?: string | null
  ) => {
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

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    try {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setUserRoles([]);
    setActiveRole(null);
    setLoading(false);
  };

  const switchRole = async (role: AppRole) => {
    if (!user) return;
    if (!userRoles.includes(role)) return;

    setActiveRole(role);
    safeStorageSet("edunation.activeRole", role);

    try {
      await supabase
        .from("profiles")
        .update({ active_role: role })
        .eq("id", user.id);
    } catch {
      /* ignore */
    }
  };

  const refetchProfile = async () => {
    if (!user) return;
    await fetchUserData(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        userRoles,
        activeRole,
        loading,
        refetchProfile,
        signUp,
        signIn,
        signOut,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
