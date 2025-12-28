-- Bootstrap schema for EduNation.
--
-- Purpose
-- =======
-- Make the database resilient to partial/failed setup by ensuring the *core* tables
-- and functions exist before later migrations reference them (especially public.students).
--
-- Safe to run multiple times.

-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Roles enum (handle both legacy Romanian enum + current English enum)
DO $bootstrap$
DECLARE
  has_type boolean;
  has_romanian boolean;
  has_new_type boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'app_role'
  ) INTO has_type;

  IF NOT has_type THEN
    CREATE TYPE public.app_role AS ENUM (
      'student',
      'parent',
      'teacher',
      'homeroom_teacher',
      'secretariat',
      'director',
      'uat_admin'
    );
  ELSE
    -- If the enum contains the old Romanian values, migrate it to the current enum.
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typnamespace = 'public'::regnamespace
        AND t.typname = 'app_role'
        AND e.enumlabel IN ('elev','profesor','parinte')
    ) INTO has_romanian;

    IF has_romanian THEN
      -- Create new enum if needed.
      SELECT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typnamespace = 'public'::regnamespace
          AND typname = 'app_role_new'
      ) INTO has_new_type;

      IF NOT has_new_type THEN
        CREATE TYPE public.app_role_new AS ENUM (
          'student',
          'parent',
          'teacher',
          'homeroom_teacher',
          'secretariat',
          'director',
          'uat_admin'
        );
      END IF;

      -- Convert columns that might already exist.
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_roles') THEN
        EXECUTE
          'ALTER TABLE public.user_roles ' ||
          'ALTER COLUMN role TYPE public.app_role_new ' ||
          'USING (CASE role::text ' ||
          'WHEN ''elev'' THEN ''student''::public.app_role_new ' ||
          'WHEN ''profesor'' THEN ''teacher''::public.app_role_new ' ||
          'WHEN ''parinte'' THEN ''parent''::public.app_role_new ' ||
          'ELSE (role::text)::public.app_role_new END)';
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
        EXECUTE
          'ALTER TABLE public.profiles ' ||
          'ALTER COLUMN active_role TYPE public.app_role_new ' ||
          'USING (CASE active_role::text ' ||
          'WHEN ''elev'' THEN ''student''::public.app_role_new ' ||
          'WHEN ''profesor'' THEN ''teacher''::public.app_role_new ' ||
          'WHEN ''parinte'' THEN ''parent''::public.app_role_new ' ||
          'ELSE (active_role::text)::public.app_role_new END)';
      END IF;

      -- Swap types (renaming avoids dropping a type still referenced).
      ALTER TYPE public.app_role RENAME TO app_role_old;
      ALTER TYPE public.app_role_new RENAME TO app_role;
      DROP TYPE public.app_role_old;
    END IF;
  END IF;
END
$bootstrap$;

-- 2) Core tables
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  active_role public.app_role DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  section TEXT NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  student_number INTEGER,
  full_name TEXT,
  is_active BOOLEAN DEFAULT false,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, class_id)
);

CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  grade DECIMAL(4,2) NOT NULL CHECK (grade >= 1 AND grade <= 10),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat')),
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id, date)
);

-- Optional but commonly used app tables. Keeping them in the bootstrap migration
-- prevents PostgREST "schema cache" errors if later migrations were skipped.

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  target_role public.app_role,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

-- Backwards-compat table used by some UI builds ("messages" == inbox/notifications).
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

-- 3) Required helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 4) New-user trigger (idempotent)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_value public.app_role;
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

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, role_value)
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles
      SET active_role = role_value
      WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 5) RLS: enable (policies themselves are defined/overridden in later migrations)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
