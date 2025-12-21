import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'student' | 'parent' | 'teacher' | 'homeroom_teacher' | 'secretariat' | 'director' | 'uat_admin';

const ALL_ROLES: AppRole[] = ['student', 'parent', 'teacher', 'homeroom_teacher', 'secretariat', 'director', 'uat_admin'];

const normalizeRole = (value: unknown): AppRole | null => {
  if (typeof value !== 'string') return null;
  return (ALL_ROLES as string[]).includes(value) ? (value as AppRole) : null;
};

// Optional bootstrap mechanism: allow the very first admin to be granted automatically
// based on email (useful when the database has no triggers/seed data yet).
// Example: VITE_BOOTSTRAP_ADMIN_EMAILS="admin@example.com,other@example.com"
const BOOTSTRAP_ADMIN_EMAILS = (import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAILS as string | undefined)
  ?.split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean) ?? [];

interface UserRole {
  role: AppRole;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  active_role: AppRole | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userRoles: AppRole[];
  activeRole: AppRole | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<{ error: Error | null }>;
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
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer fetching profile data
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setUserRoles([]);
          setActiveRole(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      // Always derive truth from the authenticated user record (metadata can be used for bootstrap).
      const { data: authUserRes } = await supabase.auth.getUser();
      const authUser = authUserRes.user;

      // Fetch profile
      let { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // If profile row is missing, create it from auth metadata.
      if (!profileData && authUser) {
        const fullName = (authUser.user_metadata?.full_name as string | undefined) ?? '';
        const email = authUser.email ?? '';
        const { data: createdProfile } = await supabase
          .from('profiles')
          .upsert({ id: userId, full_name: fullName, email, active_role: null }, { onConflict: 'id' })
          .select('*')
          .maybeSingle();
        // Prefer the created profile if returned.
        if (createdProfile) {
          profileData = createdProfile;
        }
      }
      
      setProfile(profileData as Profile | null);
      if (profileData?.active_role) {
        setActiveRole(profileData.active_role as AppRole);
      }

      // Fetch all roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const roles = (rolesData || []).map(r => r.role as AppRole);

      // Determine role(s) even if DB role rows are missing (common when RLS/policies prevent inserts).
      const metaRole = authUser
        ? (normalizeRole(authUser.user_metadata?.role)
            ?? (BOOTSTRAP_ADMIN_EMAILS.includes((authUser.email ?? '').toLowerCase()) ? 'uat_admin' : null))
        : null;

      // Prefer DB roles when available, otherwise fall back to metadata-derived roles.
      let effectiveRoles: AppRole[] = roles.length > 0 ? roles : (metaRole ? [metaRole] : []);

      // Convenience: homeroom teachers also have teacher role.
      if (effectiveRoles.includes('homeroom_teacher') && !effectiveRoles.includes('teacher')) {
        effectiveRoles = Array.from(new Set([...effectiveRoles, 'teacher']));
      }

      // Convenience: teachers may also act as directors (your requested flow: login as teacher, then select role).
      if (effectiveRoles.includes('teacher') && !effectiveRoles.includes('director')) {
        effectiveRoles = Array.from(new Set([...effectiveRoles, 'director']));
      }

      // Convenience: teachers may also act as homeroom teachers (diriginte) in your requested flow.
      if (effectiveRoles.includes('teacher') && !effectiveRoles.includes('homeroom_teacher')) {
        effectiveRoles = Array.from(new Set([...effectiveRoles, 'homeroom_teacher']));
      }

      // Best-effort bootstrap into DB so future sessions match the database. Ignore failures (often due to RLS).
      if (roles.length === 0 && metaRole) {
        try {
          await supabase.from('user_roles').insert({ user_id: userId, role: metaRole });
          if (metaRole === 'homeroom_teacher') {
            await supabase.from('user_roles').insert({ user_id: userId, role: 'teacher' });
          }
          if (metaRole === 'teacher') {
            await supabase.from('user_roles').insert({ user_id: userId, role: 'director' });
            await supabase.from('user_roles').insert({ user_id: userId, role: 'homeroom_teacher' });
          }
        } catch {
          // Ignore - DB policies may block inserts, but the app can still function using metadata + local selection.
        }
      }

      setUserRoles(effectiveRoles);
      
      // If no active role set but user has roles, set first role as active
      const active = (profileData?.active_role as AppRole | null) ?? null;

      // Persist role selection locally so the UI role switcher works even if DB updates are blocked by RLS.
      const storedRoleRaw = localStorage.getItem('eduro.activeRole');
      const storedRole = normalizeRole(storedRoleRaw);

      const pick =
        (storedRole && effectiveRoles.includes(storedRole) ? storedRole : null) ??
        (active && effectiveRoles.includes(active) ? active : null) ??
        (effectiveRoles.length > 0 ? effectiveRoles[0] : null);

      if (pick) {
        setActiveRole(pick);
        localStorage.setItem('eduro.activeRole', pick);

        // Best-effort: update profile with active role (ignore failures if RLS blocks).
        try {
          await supabase.from('profiles').update({ active_role: pick }).eq('id', userId);
        } catch {
          // ignore
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: AppRole) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            role: role,
          },
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
    setUser(null);
    setSession(null);
    setProfile(null);
    setUserRoles([]);
    setActiveRole(null);
  };

  const switchRole = async (role: AppRole) => {
    if (!user) return;

    // Allow switching only among roles the app considers available for this user.
    if (!userRoles.includes(role)) return;

    setActiveRole(role);
    localStorage.setItem('eduro.activeRole', role);

    // Best-effort: persist selection in profile (ignore failures if RLS blocks).
    try {
      await supabase.from('profiles').update({ active_role: role }).eq('id', user.id);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      userRoles,
      activeRole,
      loading,
      signUp,
      signIn,
      signOut,
      switchRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
