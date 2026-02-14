-- =============================================================================
-- EDURO - Create full database schema from scratch
-- Run this in Supabase SQL Editor when starting with an empty database.
-- Idempotent where possible (IF NOT EXISTS, OR REPLACE).
-- =============================================================================

-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'student', 'parent', 'teacher', 'homeroom_teacher', 'secretariat', 'director', 'uat_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.invitation_role AS ENUM (
    'director', 'teacher', 'homeroom_teacher', 'secretariat', 'student', 'parent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add secretariat to invitation_role if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'invitation_role' AND e.enumlabel = 'secretariat'
  ) THEN
    ALTER TYPE public.invitation_role ADD VALUE 'secretariat';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Helper functions (must exist before tables that use them)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3) Schools (no FK dependencies)
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- 4) Profiles (references auth.users - provided by Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  active_role public.app_role DEFAULT 'student',
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) User roles
DO $user_roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
    CREATE TABLE public.user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role public.app_role NOT NULL,
      UNIQUE (user_id, role)
    );
  ELSE
    -- Doar dacă coloana NU este deja app_role
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role'
        AND udt_name != 'app_role'
    ) THEN
      ALTER TABLE public.user_roles
        ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
    END IF;
  END IF;
END $user_roles$;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 6) Classes (references schools, auth.users for teacher)
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  section TEXT NOT NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- 7) Students (references classes, auth.users)
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_number INTEGER,
  full_name TEXT,
  is_active BOOLEAN DEFAULT false,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, class_id)
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 8) Subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- 9) Grades (with deleted_at for Reports RPCs)
CREATE TABLE IF NOT EXISTS public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade DECIMAL(4,2) NOT NULL CHECK (grade >= 1 AND grade <= 10),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- 10) Attendance
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending')),
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- 11) Invitations (references schools, classes, students)
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  role public.invitation_role NOT NULL,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  invited_student_number INTEGER,
  invited_email TEXT,
  invited_phone TEXT,
  intended_for TEXT,
  created_by_user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  max_uses INTEGER NOT NULL DEFAULT 1,
  current_uses INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  used_by_user_id UUID,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_class_for_student_parent CHECK (
    (role NOT IN ('student', 'parent')) OR (class_id IS NOT NULL)
  ),
  CONSTRAINT valid_student_for_parent CHECK (
    (role != 'parent') OR (student_id IS NOT NULL)
  )
);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- 12) Indexes
CREATE INDEX IF NOT EXISTS idx_invitations_code_hash ON public.invitations(code_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_school_id ON public.invitations(school_id);
CREATE INDEX IF NOT EXISTS idx_invitations_class_id ON public.invitations(class_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON public.invitations(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_deleted_at ON public.grades(deleted_at);

-- 13) Invitation RPC helpers
CREATE OR REPLACE FUNCTION public.hash_invitation_code(code TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT encode(sha256(code::bytea), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.generate_invitation_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 14) create_invitation RPC (exact signature expected by client)
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_role public.invitation_role,
  p_school_id uuid,
  p_class_id uuid DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_student_number integer DEFAULT NULL,
  p_invited_email text DEFAULT NULL,
  p_invited_phone text DEFAULT NULL,
  p_intended_for text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_max_uses integer DEFAULT 1,
  p_expires_hours integer DEFAULT 24
)
RETURNS TABLE(invitation_id uuid, plain_code text, error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_plain_code text;
  v_code_hash text;
  v_invitation_id uuid;
  v_creator_id uuid;
  v_class_school_id uuid;
BEGIN
  v_creator_id := COALESCE(p_created_by, auth.uid());
  v_user_id := v_creator_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'User not authenticated'::text;
    RETURN;
  END IF;
  IF p_max_uses < 1 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Max uses must be at least 1'::text;
    RETURN;
  END IF;
  IF p_expires_hours < 1 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Expires hours must be at least 1'::text;
    RETURN;
  END IF;

  IF public.has_role(v_user_id, 'developer'::public.app_role) THEN
    NULL;
  ELSIF public.has_role(v_user_id, 'director'::public.app_role) THEN
    IF p_role NOT IN ('teacher', 'homeroom_teacher', 'secretariat') THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Directors can only invite teacher / homeroom_teacher / secretariat'::text;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director can only create invitations for their school'::text;
      RETURN;
    END IF;
  ELSIF public.has_role(v_user_id, 'homeroom_teacher'::public.app_role) THEN
    IF p_role NOT IN ('student', 'parent') THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Homeroom teachers can only invite student / parent'::text;
      RETURN;
    END IF;
    IF p_class_id IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
      RETURN;
    END IF;
    SELECT c.school_id INTO v_class_school_id FROM public.classes c WHERE c.id = p_class_id;
    IF v_class_school_id IS NULL OR v_class_school_id <> p_school_id THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class does not belong to the specified school'::text;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id AND c.teacher_id = v_user_id) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'You are not the homeroom teacher for this class'::text;
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Not authorized to create invitations'::text;
    RETURN;
  END IF;

  IF p_role IN ('student', 'parent') AND p_class_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
    RETURN;
  END IF;
  IF p_role = 'parent' AND p_student_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Student is required for parent invitations'::text;
    RETURN;
  END IF;

  v_plain_code := public.generate_invitation_code();
  v_code_hash := public.hash_invitation_code(v_plain_code);

  INSERT INTO public.invitations (
    role, school_id, class_id, student_id,
    first_name, last_name, invited_student_number, invited_email, invited_phone, intended_for,
    code_hash, created_by_user_id, expires_at, max_uses
  ) VALUES (
    p_role, p_school_id, p_class_id, p_student_id,
    NULLIF(trim(p_first_name), ''), NULLIF(trim(p_last_name), ''),
    p_student_number,
    NULLIF(trim(p_invited_email), ''), NULLIF(trim(p_invited_phone), ''),
    NULLIF(trim(p_intended_for), ''),
    v_code_hash, v_creator_id,
    NOW() + (p_expires_hours || ' hours')::interval,
    p_max_uses
  )
  RETURNING id INTO v_invitation_id;

  RETURN QUERY SELECT v_invitation_id, v_plain_code, NULL::text;
END;
$$;

-- 15) claim_invitation RPC
CREATE OR REPLACE FUNCTION public.claim_invitation(p_code_hash text, p_user_id uuid)
RETURNS TABLE (
  success boolean,
  invitation_id uuid,
  role public.invitation_role,
  school_id uuid,
  class_id uuid,
  student_id uuid,
  first_name text,
  last_name text,
  invited_student_number integer,
  invited_email text,
  invited_phone text,
  error_message text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv record;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations i
  WHERE i.code_hash = p_code_hash AND i.revoked_at IS NULL
    AND i.expires_at > now() AND i.current_uses < i.max_uses
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false::boolean,
      NULL::uuid, NULL::public.invitation_role, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::text, NULL::text, NULL::integer, NULL::text, NULL::text,
      'Codul de invitație este invalid, expirat sau a fost deja folosit.'::text;
    RETURN;
  END IF;

  UPDATE public.invitations
  SET current_uses = current_uses + 1,
      used_at = CASE WHEN current_uses + 1 >= max_uses THEN now() ELSE used_at END,
      used_by_user_id = p_user_id
  WHERE id = v_inv.id;

  RETURN QUERY SELECT
    true::boolean,
    v_inv.id, v_inv.role, v_inv.school_id, v_inv.class_id, v_inv.student_id,
    v_inv.first_name, v_inv.last_name, v_inv.invited_student_number,
    v_inv.invited_email, v_inv.invited_phone,
    NULL::text;
END;
$$;

-- 16) revoke_invitation RPC
CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.invitations SET revoked_at = now()
  WHERE id = p_invitation_id AND revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

-- 17) Reports RPCs
CREATE OR REPLACE FUNCTION public.get_class_stats_for_display(
  p_class_id uuid, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
)
RETURNS TABLE(student_id uuid, student_name text, general_average numeric, absences_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.full_name,
    (SELECT AVG(g.grade)::numeric(4,2) FROM public.grades g
     WHERE g.student_id = s.id AND (g.deleted_at IS NULL)
       AND (p_date_from IS NULL OR g.date >= p_date_from)
       AND (p_date_to IS NULL OR g.date <= p_date_to)) AS general_average,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     WHERE a.student_id = s.id AND a.status IN ('absent', 'unexcused', 'pending')
       AND (p_date_from IS NULL OR a.date >= p_date_from)
       AND (p_date_to IS NULL OR a.date <= p_date_to)) AS absences_count
  FROM public.students s
  WHERE s.class_id = p_class_id
  ORDER BY s.student_number NULLS LAST, s.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_class_totals_for_display(
  p_class_id uuid, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
)
RETURNS TABLE(class_average numeric, total_absences bigint, total_motivated bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT AVG(g.grade)::numeric(4,2) FROM public.grades g
     JOIN public.students s2 ON s2.id = g.student_id
     WHERE s2.class_id = p_class_id AND (g.deleted_at IS NULL)
       AND (p_date_from IS NULL OR g.date >= p_date_from)
       AND (p_date_to IS NULL OR g.date <= p_date_to)) AS class_average,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     JOIN public.students s2 ON s2.id = a.student_id
     WHERE s2.class_id = p_class_id AND a.status IN ('absent', 'unexcused', 'pending')
       AND (p_date_from IS NULL OR a.date >= p_date_from)
       AND (p_date_to IS NULL OR a.date <= p_date_to)) AS total_absences,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     JOIN public.students s2 ON s2.id = a.student_id
     WHERE s2.class_id = p_class_id AND a.status IN ('motivat', 'motivated')
       AND (p_date_from IS NULL OR a.date >= p_date_from)
       AND (p_date_to IS NULL OR a.date <= p_date_to)) AS total_motivated;
END;
$$;

-- 18) New user trigger (creates profile on signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE role_value public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'phone', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  IF NEW.raw_user_meta_data ->> 'role' IS NOT NULL THEN
    role_value := CASE NEW.raw_user_meta_data ->> 'role'
      WHEN 'elev' THEN 'student'::public.app_role
      WHEN 'profesor' THEN 'teacher'::public.app_role
      WHEN 'parinte' THEN 'parent'::public.app_role
      ELSE (NEW.raw_user_meta_data ->> 'role')::public.app_role
    END;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, role_value)
    ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET active_role = role_value WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 19) Basic RLS policies (minimal for app to work)
DROP POLICY IF EXISTS "Anyone can view schools" ON public.schools;
CREATE POLICY "Anyone can view schools" ON public.schools FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Developers can manage all invitations" ON public.invitations;
CREATE POLICY "Developers can manage all invitations" ON public.invitations
  FOR ALL USING (public.has_role(auth.uid(), 'developer'::public.app_role));
DROP POLICY IF EXISTS "Users can see own invitations" ON public.invitations;
CREATE POLICY "Users can see own invitations" ON public.invitations
  FOR SELECT USING (created_by_user_id = auth.uid());
DROP POLICY IF EXISTS "Anyone can validate invitations" ON public.invitations;
CREATE POLICY "Anyone can validate invitations" ON public.invitations
  FOR SELECT USING (
    revoked_at IS NULL AND expires_at > now() AND current_uses < max_uses
  );
DROP POLICY IF EXISTS "Directors can view invitations for their school" ON public.invitations;
CREATE POLICY "Directors can view invitations for their school" ON public.invitations
  FOR SELECT USING (
    public.has_role(auth.uid(), 'director'::public.app_role) AND
    school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
  );
DROP POLICY IF EXISTS "Homeroom can view invitations for their class" ON public.invitations;
CREATE POLICY "Homeroom can view invitations for their class" ON public.invitations
  FOR SELECT USING (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role) AND
    class_id IN (SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid())
  );

-- Schools: directors/secretariat/developers can manage
DROP POLICY IF EXISTS "Directors can manage their school" ON public.schools;
CREATE POLICY "Directors can manage their school" ON public.schools FOR ALL USING (
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
  public.has_role(auth.uid(), 'developer'::public.app_role)
);

-- Classes: authenticated can view; teachers/managers can modify
DROP POLICY IF EXISTS "Authenticated can view classes" ON public.classes;
CREATE POLICY "Authenticated can view classes" ON public.classes FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Staff can manage classes" ON public.classes;
CREATE POLICY "Staff can manage classes" ON public.classes FOR ALL USING (
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
  public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role) OR
  public.has_role(auth.uid(), 'developer'::public.app_role)
);

-- Students: authenticated can view; homeroom/director/secretariat can manage
DROP POLICY IF EXISTS "Authenticated can view students" ON public.students;
CREATE POLICY "Authenticated can view students" ON public.students FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Staff can manage students" ON public.students;
CREATE POLICY "Staff can manage students" ON public.students FOR ALL USING (
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
  public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role) OR
  public.has_role(auth.uid(), 'developer'::public.app_role)
);

-- Grades & Attendance: teachers can manage for their scope
DROP POLICY IF EXISTS "Authenticated can view grades" ON public.grades;
CREATE POLICY "Authenticated can view grades" ON public.grades FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Teachers can manage grades" ON public.grades;
CREATE POLICY "Teachers can manage grades" ON public.grades FOR ALL USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role) OR
  public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role) OR
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
  public.has_role(auth.uid(), 'developer'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated can view attendance" ON public.attendance;
CREATE POLICY "Authenticated can view attendance" ON public.attendance FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Teachers can manage attendance" ON public.attendance;
CREATE POLICY "Teachers can manage attendance" ON public.attendance FOR ALL USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role) OR
  public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role) OR
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
  public.has_role(auth.uid(), 'developer'::public.app_role)
);

-- Subjects: authenticated can view; staff can manage
DROP POLICY IF EXISTS "Authenticated can view subjects" ON public.subjects;
CREATE POLICY "Authenticated can view subjects" ON public.subjects FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Staff can manage subjects" ON public.subjects;
CREATE POLICY "Staff can manage subjects" ON public.subjects FOR ALL USING (
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
  public.has_role(auth.uid(), 'teacher'::public.app_role) OR
  public.has_role(auth.uid(), 'developer'::public.app_role)
);

-- User roles: directors/admins can view and manage
DROP POLICY IF EXISTS "Staff can view all roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles" ON public.user_roles FOR SELECT USING (
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'uat_admin'::public.app_role)
);
DROP POLICY IF EXISTS "Staff can manage roles" ON public.user_roles;
CREATE POLICY "Staff can manage roles" ON public.user_roles FOR ALL USING (
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'uat_admin'::public.app_role)
);

-- Directors can view all profiles
DROP POLICY IF EXISTS "Directors can view all profiles" ON public.profiles;
CREATE POLICY "Directors can view all profiles" ON public.profiles FOR SELECT USING (
  public.has_role(auth.uid(), 'director'::public.app_role) OR
  public.has_role(auth.uid(), 'uat_admin'::public.app_role)
);
