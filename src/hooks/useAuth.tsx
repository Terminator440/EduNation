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

      // Bootstrap roles if missing (common in projects without DB triggers).
      let effectiveRoles = roles;
      if (effectiveRoles.length === 0 && authUser) {
        const metaRole = normalizeRole(authUser.user_metadata?.role)
          ?? (BOOTSTRAP_ADMIN_EMAILS.includes((authUser.email ?? '').toLowerCase()) ? 'uat_admin' : null);
        if (metaRole) {
          // Insert the primary role
          await supabase.from('user_roles').insert({ user_id: userId, role: metaRole });
          effectiveRoles = [metaRole];

          // If user is homeroom teacher, also grant teacher role for convenience.
          if (metaRole === 'homeroom_teacher') {
            await supabase.from('user_roles').insert({ user_id: userId, role: 'teacher' });
            effectiveRoles = Array.from(new Set([...effectiveRoles, 'teacher']));
          }
        }
      }

      setUserRoles(effectiveRoles);
      
      // If no active role set but user has roles, set first role as active
      const active = (profileData?.active_role as AppRole | null) ?? null;
      if (!active && effectiveRoles.length > 0) {
        setActiveRole(effectiveRoles[0]);
        // Update profile with active role
        await supabase
          .from('profiles')
          .update({ active_role: effectiveRoles[0] })
          .eq('id', userId);
      } else if (active) {
        setActiveRole(active);
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
    if (!user || !userRoles.includes(role)) return;
    
    setActiveRole(role);
    
    // Update profile with new active role
    await supabase
      .from('profiles')
      .update({ active_role: role })
      .eq('id', user.id);
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
