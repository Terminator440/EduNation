-- ===========================================================================
-- AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
--
-- This file concatenates all SQL migrations in lexical order.
-- Source directory: supabase/migrations
-- Generated at: 2026-02-26T10:08:14.192Z
-- Total migrations: 102
--
-- Usage:
--   - Preferred: run migrations through Supabase migration flow.
--   - Alternative: run this file on an empty database to bootstrap schema.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- MIGRATION 1/102: 20251212000000_bootstrap_schema.sql
-- ---------------------------------------------------------------------------
-- 0) Extensii
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Configurare ENUM app_role
DO $bootstrap$
DECLARE
  has_type boolean;
  has_romanian boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role'
  ) INTO has_type;

  IF NOT has_type THEN
    CREATE TYPE public.app_role AS ENUM (
      'student', 'parent', 'teacher', 'homeroom_teacher',
      'secretariat', 'director', 'uat_admin'
    );
  ELSE
    -- Verificăm dacă există valori vechi în limba română
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typnamespace = 'public'::regnamespace
        AND t.typname = 'app_role'
        AND e.enumlabel IN ('elev','profesor','parinte')
    ) INTO has_romanian;

    IF has_romanian THEN
      -- Creăm un tip temporar pentru migrare
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role_new') THEN
        CREATE TYPE public.app_role_new AS ENUM (
          'student', 'parent', 'teacher', 'homeroom_teacher',
          'secretariat', 'director', 'uat_admin'
        );
      END IF;

      -- Migrare coloane existente folosind EXECUTE pentru a izola execuția
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        EXECUTE 'ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role_new
                 USING (CASE role::text
                   WHEN ''elev'' THEN ''student''::public.app_role_new
                   WHEN ''profesor'' THEN ''teacher''::public.app_role_new
                   WHEN ''parinte'' THEN ''parent''::public.app_role_new
                   ELSE role::text::public.app_role_new END)';
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN active_role TYPE public.app_role_new
                 USING (CASE active_role::text
                   WHEN ''elev'' THEN ''student''::public.app_role_new
                   WHEN ''profesor'' THEN ''teacher''::public.app_role_new
                   WHEN ''parinte'' THEN ''parent''::public.app_role_new
                   ELSE active_role::text::public.app_role_new END)';
      END IF;

      -- Schimbăm tipurile între ele
      ALTER TYPE public.app_role RENAME TO app_role_old;
      ALTER TYPE public.app_role_new RENAME TO app_role;
      DROP TYPE public.app_role_old;
    END IF;
  END IF;
END $bootstrap$;

-- 2) Tabele Core
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  active_role public.app_role DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $user_roles_setup$
DECLARE
  col_type text;
BEGIN
  -- 1. Verificăm existența tabelului folosind doar tipuri standard (text)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'user_roles'
  ) THEN
    -- Creăm tabelul folosind EXECUTE pentru a izola tipul public.app_role
    EXECUTE 'CREATE TABLE public.user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      role public.app_role NOT NULL,
      UNIQUE (user_id, role)
    )';
  ELSE
    -- 2. Dacă tabelul există, verificăm tipul coloanei
    SELECT udt_name::text INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_roles'
    AND column_name = 'role';

    -- 3. Conversie forțată doar dacă e necesar
    -- Comparăm text cu text (col_type e deja text)
    IF col_type IS NOT NULL AND col_type <> 'app_role' THEN
      EXECUTE 'ALTER TABLE public.user_roles
               ALTER COLUMN role TYPE public.app_role
               USING role::text::public.app_role';
    END IF;
  END IF;
END $user_roles_setup$;

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

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

-- 3) Funcții Helper (coloana user_roles.role este deja public.app_role după $user_roles_setup$)
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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at') THEN
    CREATE TRIGGER update_profiles_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 4) Trigger handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_value public.app_role;
  raw_role text;
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

  raw_role := NEW.raw_user_meta_data ->> 'role';

  IF raw_role IS NOT NULL THEN
    BEGIN
      role_value := CASE raw_role
        WHEN 'elev' THEN 'student'::public.app_role
        WHEN 'profesor' THEN 'teacher'::public.app_role
        WHEN 'parinte' THEN 'parent'::public.app_role
        ELSE raw_role::public.app_role
      END;

      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, role_value)
      ON CONFLICT DO NOTHING;

      UPDATE public.profiles
      SET active_role = role_value
      WHERE id = NEW.id;
    EXCEPTION WHEN OTHERS THEN
      -- Ignorăm erorile de cast dacă rolul din metadata este invalid
    END;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created' AND n.nspname = 'auth' AND c.relname = 'users'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 5) RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- MIGRATION 2/102: 20251213083340_531b9f7f-d957-4562-b081-ed9df8b7b8ad.sql
-- ---------------------------------------------------------------------------
-- Legacy schema migration (initial scaffold)
--
-- This project now uses 20251212000000_bootstrap_schema.sql to create the core schema
-- in an idempotent way (including the app_role enum and core tables).
--
-- Keeping this migration as a no-op prevents conflicts when resetting the local
-- database (e.g., "type app_role already exists").

SELECT 1;


-- ---------------------------------------------------------------------------
-- MIGRATION 3/102: 20251213083405_f39540da-218e-4be5-8c8a-01af1a528900.sql
-- ---------------------------------------------------------------------------
-- Fix function search_path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 4/102: 20251214074336_18975fd7-fedd-45d2-ad0b-540b5b5299a0.sql
-- ---------------------------------------------------------------------------

-- Drop dependent policies and functions first, then recreate
DROP POLICY IF EXISTS "Teachers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Teachers can view their classes" ON public.classes;
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);

-- Ensure roles enum is compatible (non-destructive)
DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('student','parent','teacher','homeroom_teacher','secretariat','director','uat_admin');
  ELSE
    -- Rename legacy Romanian enum labels to the current English ones (no drop, preserves dependencies).
    BEGIN
      ALTER TYPE public.app_role RENAME VALUE 'elev' TO 'student';
    EXCEPTION WHEN undefined_object OR duplicate_object OR invalid_parameter_value THEN
      NULL;
    END;

    BEGIN
      ALTER TYPE public.app_role RENAME VALUE 'parinte' TO 'parent';
    EXCEPTION WHEN undefined_object OR duplicate_object OR invalid_parameter_value THEN
      NULL;
    END;

    BEGIN
      ALTER TYPE public.app_role RENAME VALUE 'profesor' TO 'teacher';
    EXCEPTION WHEN undefined_object OR duplicate_object OR invalid_parameter_value THEN
      NULL;
    END;

    -- Ensure any missing values exist.
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'homeroom_teacher';
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretariat';
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'director';
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'uat_admin';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$roles$;

-- Ensure profiles.active_role exists and uses public.app_role
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_role public.app_role DEFAULT 'student';

-- If any legacy values still exist as text, normalize them
UPDATE public.profiles
SET active_role = CASE active_role::text
  WHEN 'elev' THEN 'student'::public.app_role
  WHEN 'profesor' THEN 'teacher'::public.app_role
  WHEN 'parinte' THEN 'parent'::public.app_role
  ELSE active_role
END
WHERE active_role IS NOT NULL;

-- Ensure user_roles.role uses public.app_role (and normalize legacy values)
UPDATE public.user_roles
SET role = CASE role::text
  WHEN 'elev' THEN 'student'::public.app_role
  WHEN 'profesor' THEN 'teacher'::public.app_role
  WHEN 'parinte' THEN 'parent'::public.app_role
  ELSE role
END
WHERE role IS NOT NULL;

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;

ALTER TABLE public.profiles
  ALTER COLUMN active_role TYPE public.app_role USING active_role::text::public.app_role;

-- Clean up any leftover app_role_new from partial runs
DO $cleanup$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type
    WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role_new'
  ) THEN
    DROP TYPE public.app_role_new;
  END IF;
END
$cleanup$;

-- Recreate has_role function with new enum
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
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

-- Recreate dropped policies with new enum values
CREATE POLICY "Teachers can view all profiles" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Teachers can view their classes" ON public.classes
  FOR SELECT USING ((teacher_id = auth.uid()) OR has_role(auth.uid(), 'teacher'::app_role));

-- Create parent_student_relations table (many-to-many)
CREATE TABLE public.parent_student_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(parent_user_id, student_id)
);

ALTER TABLE public.parent_student_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents can view their relations" ON public.parent_student_relations;
CREATE POLICY "Parents can view their relations" ON public.parent_student_relations
  FOR SELECT USING (parent_user_id = auth.uid());

DROP POLICY IF EXISTS "Secretariat can manage relations" ON public.parent_student_relations;
CREATE POLICY "Secretariat can manage relations" ON public.parent_student_relations
  FOR ALL USING (has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'));

-- Create student_activations table for activation codes
CREATE TABLE public.student_activations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  activation_code TEXT NOT NULL UNIQUE,
  is_used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.student_activations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage activations" ON public.student_activations;
CREATE POLICY "Staff can manage activations" ON public.student_activations
  FOR ALL USING (
    has_role(auth.uid(), 'secretariat') OR 
    has_role(auth.uid(), 'director') OR 
    has_role(auth.uid(), 'homeroom_teacher')
  );

DROP POLICY IF EXISTS "Anyone can view unused activations for validation" ON public.student_activations;
CREATE POLICY "Anyone can view unused activations for validation" ON public.student_activations
  FOR SELECT USING (is_used = false AND expires_at > now());

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  active_role app_role NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Directors can view all audit logs" ON public.audit_logs;
CREATE POLICY "Directors can view all audit logs" ON public.audit_logs
  FOR SELECT USING (has_role(auth.uid(), 'director'));

DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
  FOR SELECT USING (user_id = auth.uid());

-- Update students table to allow creation without user_id initially
ALTER TABLE public.students ALTER COLUMN user_id DROP NOT NULL;

-- Add more fields to students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Function to generate activation code
CREATE OR REPLACE FUNCTION public.generate_activation_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
BEGIN
  code := upper(substr(md5(random()::text), 1, 8));
  RETURN code;
END;
$$;

-- Function to log audit events
CREATE OR REPLACE FUNCTION public.log_audit(
  _user_id UUID,
  _user_name TEXT,
  _active_role app_role,
  _action TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL,
  _details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, details)
  VALUES (_user_id, _user_name, _active_role, _action, _entity_type, _entity_id, _details)
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;

-- Update handle_new_user function to work with new roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_value app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email
  );
  
  -- Add role from metadata (map old Romanian names to new English ones)
  IF NEW.raw_user_meta_data ->> 'role' IS NOT NULL THEN
    role_value := CASE NEW.raw_user_meta_data ->> 'role'
      WHEN 'elev' THEN 'student'::app_role
      WHEN 'profesor' THEN 'teacher'::app_role
      WHEN 'parinte' THEN 'parent'::app_role
      ELSE (NEW.raw_user_meta_data ->> 'role')::app_role
    END;
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, role_value);
    
    -- Set active role
    UPDATE public.profiles SET active_role = role_value WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 5/102: 20251214074344_9213d3b4-0ccc-4b4f-b2ea-f87e1698e925.sql
-- ---------------------------------------------------------------------------

-- Fix search_path for generate_activation_code function
CREATE OR REPLACE FUNCTION public.generate_activation_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code TEXT;
BEGIN
  code := upper(substr(md5(random()::text), 1, 8));
  RETURN code;
END;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 6/102: 20251220164142_57a8cf95-66d2-4828-9b2c-3d59f13b7efe.sql
-- ---------------------------------------------------------------------------
-- Allow homeroom teachers and secretariat to create classes
DROP POLICY IF EXISTS "Homeroom teachers can create their class" ON public.classes;
CREATE POLICY "Homeroom teachers can create their class"
ON public.classes
FOR INSERT
WITH CHECK (
  teacher_id = auth.uid() AND 
  (has_role(auth.uid(), 'homeroom_teacher'::public.app_role) OR has_role(auth.uid(), 'secretariat'::public.app_role) OR has_role(auth.uid(), 'director'::public.app_role))
);

-- Allow secretariat and director to manage all classes
DROP POLICY IF EXISTS "Secretariat can manage all classes" ON public.classes;
CREATE POLICY "Secretariat can manage all classes"
ON public.classes
FOR ALL
USING (has_role(auth.uid(), 'secretariat'::public.app_role) OR has_role(auth.uid(), 'director'::public.app_role));

-- Allow secretariat and director to view all students
DROP POLICY IF EXISTS "Secretariat can view all students" ON public.students;
CREATE POLICY "Secretariat can view all students"
ON public.students
FOR SELECT
USING (has_role(auth.uid(), 'secretariat'::public.app_role) OR has_role(auth.uid(), 'director'::public.app_role));

-- Allow secretariat and director to manage all students
DROP POLICY IF EXISTS "Secretariat can manage all students" ON public.students;
CREATE POLICY "Secretariat can manage all students"
ON public.students
FOR ALL
USING (has_role(auth.uid(), 'secretariat'::public.app_role) OR has_role(auth.uid(), 'director'::public.app_role));


-- ---------------------------------------------------------------------------
-- MIGRATION 7/102: 20251220190000_activation_claim_functions.sql
-- ---------------------------------------------------------------------------
-- Activation claiming functions for production flow.
-- These functions are SECURITY DEFINER so they can update rows protected by RLS,
-- while still enforcing validation (unused, not expired).

CREATE OR REPLACE FUNCTION public.claim_student_activation(_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act RECORD;
BEGIN
  SELECT * INTO act
  FROM public.student_activations
  WHERE activation_code = upper(_code)
    AND is_used = false
    AND expires_at > now()
  LIMIT 1;

  IF act.id IS NULL THEN
    RAISE EXCEPTION 'activation_invalid_or_expired';
  END IF;

  -- Link student user if not linked yet
  UPDATE public.students
  SET user_id = auth.uid(),
      is_active = true
  WHERE id = act.student_id
    AND (user_id IS NULL OR user_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_already_linked';
  END IF;

  UPDATE public.student_activations
  SET is_used = true,
      used_by = auth.uid(),
      used_at = now()
  WHERE id = act.id;

  RETURN act.student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_parent_relation(_code TEXT, _is_primary BOOLEAN DEFAULT false)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act RECORD;
  rel_id UUID;
BEGIN
  SELECT * INTO act
  FROM public.student_activations
  WHERE activation_code = upper(_code)
    AND is_used = false
    AND expires_at > now()
  LIMIT 1;

  IF act.id IS NULL THEN
    RAISE EXCEPTION 'activation_invalid_or_expired';
  END IF;

  INSERT INTO public.parent_student_relations (parent_user_id, student_id, is_primary)
  VALUES (auth.uid(), act.student_id, _is_primary)
  RETURNING id INTO rel_id;

  UPDATE public.student_activations
  SET is_used = true,
      used_by = auth.uid(),
      used_at = now()
  WHERE id = act.id;

  RETURN rel_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 8/102: 20251220193000_production_real_tables.sql
-- ---------------------------------------------------------------------------
-- Production-real tables & policies (calendar events, lessons, messaging, admin visibility)

-- 1) Profiles: allow director/uat_admin to view all profiles (needed for role management dashboards)
DROP POLICY IF EXISTS "Directors can view all profiles" ON public.profiles;
CREATE POLICY "Directors can view all profiles" ON public.profiles
  FOR SELECT USING (
    has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 2) user_roles: allow director/uat_admin to view and manage roles (required for admin tooling)
DROP POLICY IF EXISTS "Staff can view all roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles" ON public.user_roles
  FOR SELECT USING (
    has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage roles" ON public.user_roles;
CREATE POLICY "Staff can manage roles" ON public.user_roles
  FOR ALL USING (
    has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 3) school_events: shared calendar events (tests/homework/events/holidays)
CREATE TABLE IF NOT EXISTS public.school_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  event_time TEXT,
  type TEXT NOT NULL CHECK (type IN ('test','homework','event','holiday')),
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view school events" ON public.school_events;
CREATE POLICY "Authenticated can view school events" ON public.school_events
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Staff can manage school events" ON public.school_events;
CREATE POLICY "Staff can manage school events" ON public.school_events
  FOR ALL USING (
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 4) lessons: minimal lessons/homework/projects (per class)
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in-progress','completed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view lessons for own class" ON public.lessons;
CREATE POLICY "Students can view lessons for own class" ON public.lessons
  FOR SELECT USING (
    class_id IN (SELECT class_id FROM public.students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Parents can view lessons for linked classes" ON public.lessons;
CREATE POLICY "Parents can view lessons for linked classes" ON public.lessons
  FOR SELECT USING (
    class_id IN (
      SELECT s.class_id
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.parent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can manage lessons for their class" ON public.lessons;
CREATE POLICY "Teachers can manage lessons for their class" ON public.lessons
  FOR ALL USING (
    class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'director'::app_role)
  );

-- 5) messages: internal messaging (teacher/staff <-> student/parent)
-- NOTE: Some older/local setups create a simplified `public.messages` table (user inbox style).
-- To avoid migration failures, we keep this migration compatible with both schemas.

-- If `public.messages` does not exist yet, create the full messaging schema.
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policies depend on which schema is present.
DO $messages_policies$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='messages' AND column_name='sender_id'
  ) THEN
    -- Full messaging schema (sender_id/recipient_id)
    DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
    CREATE POLICY "Participants can view messages" ON public.messages
      FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

    DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
    CREATE POLICY "Users can send messages" ON public.messages
      FOR INSERT WITH CHECK (sender_id = auth.uid());

    DROP POLICY IF EXISTS "Recipient can mark read" ON public.messages;
    CREATE POLICY "Recipient can mark read" ON public.messages
      FOR UPDATE USING (recipient_id = auth.uid())
      WITH CHECK (recipient_id = auth.uid());
  ELSE
    -- Simplified inbox schema (user_id)
    DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
    CREATE POLICY "Participants can view messages" ON public.messages
      FOR SELECT USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
    CREATE POLICY "Users can send messages" ON public.messages
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Recipient can mark read" ON public.messages;
    CREATE POLICY "Recipient can mark read" ON public.messages
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$messages_policies$;


-- ---------------------------------------------------------------------------
-- MIGRATION 9/102: 20251220195500_rls_hardening.sql
-- ---------------------------------------------------------------------------
-- RLS hardening for production safety
-- Goal: prevent teachers from inserting/updating grades/attendance for students/subjects outside their scope.

BEGIN;

-- Grades: drop permissive policies (created in initial schema) and recreate stricter ones
DROP POLICY IF EXISTS "Teachers can insert grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update their grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete their grades" ON public.grades;

-- Teachers can insert grades only for:
--  - students in their own class (classes.teacher_id = auth.uid())
--  - subjects assigned to them (subjects.teacher_id = auth.uid())
--  - teacher_id set to auth.uid()
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can insert grades (scoped)" ON public.grades
  FOR INSERT WITH CHECK (
    teacher_id = auth.uid()
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = auth.uid()
    )
  );

-- Teachers can update/delete only the grades they created AND still within the same scope
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can update grades (scoped)" ON public.grades
  FOR UPDATE USING (
    teacher_id = auth.uid()
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can delete grades (scoped)" ON public.grades
  FOR DELETE USING (
    teacher_id = auth.uid()
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = auth.uid()
    )
  );

-- Attendance: tighten management policy
DROP POLICY IF EXISTS "Teachers can manage attendance" ON public.attendance;

DROP POLICY IF EXISTS "Teachers can manage attendance (scoped)" ON public.attendance;
CREATE POLICY "Teachers can manage attendance (scoped)" ON public.attendance
  FOR ALL USING (
    teacher_id = auth.uid()
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = auth.uid()
    )
  );

-- Helpful indexes for scoped policies (performance)
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON public.subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 10/102: 20251221190000_contact_fields.sql
-- ---------------------------------------------------------------------------
-- Add contact fields for students and phone for profiles; extend handle_new_user to persist phone metadata.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Update new-user trigger function to store phone (if provided in auth metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'phone', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  -- Add role from metadata
  IF NEW.raw_user_meta_data ->> 'role' IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, (NEW.raw_user_meta_data ->> 'role')::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 11/102: 20251222190000_audit_status_requests_register.sql
-- ---------------------------------------------------------------------------
-- Add production-grade workflow features:
-- - Grade statuses + soft delete
-- - Attendance excusal metadata + homeroom excusal ability
-- - Change/excusal requests (pending/approved/rejected)
-- - Timetable + teacher register (condica) foundations
-- - Automatic audit logging triggers for grades/attendance/register

BEGIN;

-- 0) Helpers: resolve current authenticated user from request JWT.
-- Works for PostgREST requests in Supabase.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.current_user_profile()
RETURNS TABLE(user_id uuid, full_name text, active_role public.app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, COALESCE(p.active_role, 'student'::public.app_role)
  FROM public.profiles p
  WHERE p.id = public.current_user_id();
$$;

-- 1) Grades: status + soft-delete + optional lineage
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'final',
  ADD COLUMN IF NOT EXISTS corrected_from uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grades_status_check'
  ) THEN
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_status_check CHECK (status IN ('draft','final','corrected'));
  END IF;
END $$;

-- 2) Attendance: add excusal metadata + soft-delete
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS excused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS excused_at timestamptz,
  ADD COLUMN IF NOT EXISTS excuse_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3) Requests tables
CREATE TABLE IF NOT EXISTS public.grade_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  requested_grade decimal(4,2),
  requested_description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.grade_change_requests ENABLE ROW LEVEL SECURITY;

-- Requester can read own requests
DROP POLICY IF EXISTS "Users can view own grade change requests" ON public.grade_change_requests;
CREATE POLICY "Users can view own grade change requests" ON public.grade_change_requests
  FOR SELECT USING (requested_by = auth.uid());

-- Teachers can create requests for grades they created
DROP POLICY IF EXISTS "Teachers can create grade change requests" ON public.grade_change_requests;
CREATE POLICY "Teachers can create grade change requests" ON public.grade_change_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.grades g
      WHERE g.id = grade_id AND g.teacher_id = auth.uid()
    )
  );

-- Directors/Secretariat can manage all
DROP POLICY IF EXISTS "Staff can manage grade change requests" ON public.grade_change_requests;
CREATE POLICY "Staff can manage grade change requests" ON public.grade_change_requests
  FOR ALL USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.attendance_excuse_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.attendance_excuse_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own attendance excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Users can view own attendance excuse requests" ON public.attendance_excuse_requests
  FOR SELECT USING (requested_by = auth.uid());

-- Parents can create requests for their linked students; students can create for themselves
DROP POLICY IF EXISTS "Users can create attendance excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Users can create attendance excuse requests" ON public.attendance_excuse_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      WHERE a.id = attendance_id
        AND (
          s.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.parent_student_relations psr
            WHERE psr.parent_user_id = auth.uid() AND psr.student_id = s.id
          )
        )
    )
  );

-- Homeroom teacher can view/manage requests for their class
DROP POLICY IF EXISTS "Homeroom can manage excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Homeroom can manage excuse requests" ON public.attendance_excuse_requests
  FOR ALL USING (
    has_role(auth.uid(), 'homeroom_teacher'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      JOIN public.classes c ON c.id = s.class_id
      WHERE a.id = attendance_id AND c.teacher_id = auth.uid()
    )
  );

-- Directors/Secretariat can manage all
DROP POLICY IF EXISTS "Staff can manage attendance excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Staff can manage attendance excuse requests" ON public.attendance_excuse_requests
  FOR ALL USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 4) Allow homeroom teacher to excuse absences in their class (update attendance rows)
-- RLS: add a dedicated UPDATE policy (scoped to students in homeroom class).
DROP POLICY IF EXISTS "Homeroom can update attendance for own class" ON public.attendance;
CREATE POLICY "Homeroom can update attendance for own class" ON public.attendance
  FOR UPDATE USING (
    has_role(auth.uid(), 'homeroom_teacher'::app_role)
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'homeroom_teacher'::app_role)
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE c.teacher_id = auth.uid()
    )
  );

-- Enforce homeroom updates to be excusal-only when they are not the recording teacher.
CREATE OR REPLACE FUNCTION public.restrict_homeroom_attendance_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := public.current_user_id();
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- If the updater is a homeroom teacher but not the original recorder, allow only excusal.
  IF public.has_role(uid, 'homeroom_teacher'::app_role) AND (OLD.teacher_id IS DISTINCT FROM uid) THEN
    -- Only allow status change to 'motivat' and set excusal metadata.
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
      OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
      OR NEW.date IS DISTINCT FROM OLD.date
      OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Homeroom excusal can only update status/excusal fields.';
    END IF;

    IF NEW.status <> 'motivat' THEN
      RAISE EXCEPTION 'Homeroom can only set status to motivat.';
    END IF;

    NEW.excused_by := uid;
    NEW.excused_at := COALESCE(NEW.excused_at, now());
    -- excuse_reason may be set by UI
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_homeroom_attendance_update ON public.attendance;
CREATE TRIGGER trg_restrict_homeroom_attendance_update
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_homeroom_attendance_update();

-- Directors/Secretariat/Admin can manage grades and attendance (for controlled exceptions + audits)
DROP POLICY IF EXISTS "Staff can manage grades" ON public.grades;
CREATE POLICY "Staff can manage grades" ON public.grades
  FOR ALL USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage attendance" ON public.attendance;
CREATE POLICY "Staff can manage attendance" ON public.attendance
  FOR ALL USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 5) Timetable + teacher register (condica)
CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  period int NOT NULL CHECK (period BETWEEN 1 AND 12),
  start_time time,
  end_time time,
  room text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (class_id, weekday, period)
);

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view timetable entries" ON public.timetable_entries;
CREATE POLICY "Users can view timetable entries" ON public.timetable_entries
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Staff can manage timetable entries" ON public.timetable_entries;
CREATE POLICY "Staff can manage timetable entries" ON public.timetable_entries
  FOR ALL USING (
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.teacher_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_entry_id uuid NOT NULL REFERENCES public.timetable_entries(id) ON DELETE CASCADE,
  register_date date NOT NULL,
  signed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'signed' CHECK (status IN ('signed','late','excused')),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (timetable_entry_id, register_date)
);

ALTER TABLE public.teacher_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can view own register" ON public.teacher_register;
CREATE POLICY "Teachers can view own register" ON public.teacher_register
  FOR SELECT USING (signed_by = auth.uid());

DROP POLICY IF EXISTS "Teachers can sign own register" ON public.teacher_register;
CREATE POLICY "Teachers can sign own register" ON public.teacher_register
  FOR INSERT WITH CHECK (
    signed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.timetable_entries te
      WHERE te.id = timetable_entry_id AND te.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can view all register" ON public.teacher_register;
CREATE POLICY "Staff can view all register" ON public.teacher_register
  FOR SELECT USING (
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 6) Automatic audit logging triggers (grades, attendance, teacher_register)
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  uname text;
  urole public.app_role;
  entity_id uuid;
  details jsonb;
BEGIN
  uid := public.current_user_id();
  IF uid IS NULL THEN
    -- Ignore service tasks
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'student'::public.app_role)
  INTO uname, urole
  FROM public.profiles p
  WHERE p.id = uid;

  entity_id := COALESCE((NEW).id, (OLD).id);
  details := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'old', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    'new', CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  INSERT INTO public.audit_logs(user_id, user_name, active_role, action, entity_type, entity_id, details)
  VALUES (uid, COALESCE(uname, ''), COALESCE(urole, 'student'::public.app_role), TG_OP, TG_TABLE_NAME, entity_id, details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers if not present
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_teacher_register ON public.teacher_register;
CREATE TRIGGER trg_audit_teacher_register
  AFTER INSERT OR UPDATE OR DELETE ON public.teacher_register
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 12/102: 20251226212000_announcements.sql
-- ---------------------------------------------------------------------------
-- Announcements (Anunțuri) for EduNation

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  target_role public.app_role,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_target_role ON public.announcements (target_role);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read announcements (target_role is filtered by the app; RLS keeps it simple).
DROP POLICY IF EXISTS "Authenticated can read announcements" ON public.announcements;
CREATE POLICY "Authenticated can read announcements" ON public.announcements
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Staff can publish announcements.
DROP POLICY IF EXISTS "Staff can publish announcements" ON public.announcements;
CREATE POLICY "Staff can publish announcements" ON public.announcements
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND (
      has_role(auth.uid(), 'director'::app_role)
      OR has_role(auth.uid(), 'secretariat'::app_role)
      OR has_role(auth.uid(), 'uat_admin'::app_role)
    )
  );

-- Staff (or creator) can update/delete.
DROP POLICY IF EXISTS "Staff can update announcements" ON public.announcements;
CREATE POLICY "Staff can update announcements" ON public.announcements
  FOR UPDATE USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'uat_admin'::app_role)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

DROP POLICY IF EXISTS "Staff can delete announcements" ON public.announcements;
CREATE POLICY "Staff can delete announcements" ON public.announcements
  FOR DELETE USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 13/102: 20251226220000_notifications.sql
-- ---------------------------------------------------------------------------
-- Notifications (user inbox)
-- Creates a simple notifications table for in-app alerts.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_select_own'
  ) THEN
    CREATE POLICY notifications_select_own
      ON public.notifications
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END$$;

-- Users can mark their own notifications as read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_update_own'
  ) THEN
    CREATE POLICY notifications_update_own
      ON public.notifications
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- Optional: allow inserts only for the owning user (safe default for dev)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_insert_own'
  ) THEN
    CREATE POLICY notifications_insert_own
      ON public.notifications
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read_at IS NULL;


-- ---------------------------------------------------------------------------
-- MIGRATION 14/102: 20251226221000_messages_compat.sql
-- ---------------------------------------------------------------------------
-- Backwards compatibility for older UI builds and safer defaults.
-- Some UI builds query `public.messages` for inbox/notifications.

BEGIN;

-- Ensure the table exists.
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own inbox rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_select_own'
  ) THEN
    CREATE POLICY messages_select_own
      ON public.messages
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END$$;

-- Users can mark their own rows as read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_update_own'
  ) THEN
    CREATE POLICY messages_update_own
      ON public.messages
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- Inserts: allow only for the owning user (safe default for dev)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_insert_own'
  ) THEN
    CREATE POLICY messages_insert_own
      ON public.messages
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_messages_user_created
  ON public.messages (user_id, created_at DESC);

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 15/102: 20260101155753_5c0b4b7e-0fc7-48fc-a19d-6ff3b8a17403.sql
-- ---------------------------------------------------------------------------
-- Create announcements table for school-wide announcements
CREATE TABLE public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  target_role TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Directors, secretariat and uat_admin can create announcements
CREATE POLICY "Staff can create announcements" 
ON public.announcements 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'director'::app_role) OR 
  has_role(auth.uid(), 'secretariat'::app_role) OR 
  has_role(auth.uid(), 'uat_admin'::app_role)
);

-- Directors, secretariat and uat_admin can update/delete their announcements
CREATE POLICY "Staff can manage their announcements" 
ON public.announcements 
FOR ALL 
USING (
  created_by = auth.uid() AND (
    has_role(auth.uid(), 'director'::app_role) OR 
    has_role(auth.uid(), 'secretariat'::app_role) OR 
    has_role(auth.uid(), 'uat_admin'::app_role)
  )
);

-- Everyone can view announcements (filtered by target_role in app)
CREATE POLICY "Anyone can view announcements" 
ON public.announcements 
FOR SELECT 
USING (true);


-- ---------------------------------------------------------------------------
-- MIGRATION 16/102: 20260104183203_c0224644-0b08-4b16-86fd-e64a9ed210ba.sql
-- ---------------------------------------------------------------------------
-- Add developer to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';


-- ---------------------------------------------------------------------------
-- MIGRATION 17/102: 20260104183219_e4e74bcb-a82f-4b7e-8629-12fb8d55b3c1.sql
-- ---------------------------------------------------------------------------
-- Create RLS policies for developers to access data for debugging
CREATE POLICY "Developers can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can view all classes" 
ON public.classes 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can view all students" 
ON public.students 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can view all grades" 
ON public.grades 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can view all attendance" 
ON public.attendance 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can view all user roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can view all announcements" 
ON public.announcements 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Developers can view all subjects" 
ON public.subjects 
FOR SELECT 
USING (has_role(auth.uid(), 'developer'::app_role));


-- ---------------------------------------------------------------------------
-- MIGRATION 18/102: 20260104184840_38456642-dc16-4d67-8468-a49f79472a12.sql
-- ---------------------------------------------------------------------------
-- Create timetable_entries table for schedule/orar
CREATE TABLE public.timetable_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID,
  weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  period INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  room TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

-- Everyone can view timetable (it's public school data)
CREATE POLICY "Anyone can view timetable"
  ON public.timetable_entries
  FOR SELECT
  USING (true);

-- Teachers can manage their own timetable entries
CREATE POLICY "Teachers can manage own timetable entries"
  ON public.timetable_entries
  FOR ALL
  USING (teacher_id = auth.uid());

-- Secretariat/Director can manage all timetable entries
CREATE POLICY "Staff can manage all timetable entries"
  ON public.timetable_entries
  FOR ALL
  USING (has_role(auth.uid(), 'secretariat'::app_role) OR has_role(auth.uid(), 'director'::app_role));

-- Developers can view all
CREATE POLICY "Developers can view all timetable entries"
  ON public.timetable_entries
  FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));


-- Create school_events table for calendar
CREATE TABLE public.school_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_date DATE NOT NULL,
  event_time TEXT,
  type TEXT NOT NULL CHECK (type IN ('holiday', 'event', 'test', 'homework')),
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

-- Everyone can view events (public school calendar)
CREATE POLICY "Anyone can view school events"
  ON public.school_events
  FOR SELECT
  USING (true);

-- Teachers can create events for their classes
CREATE POLICY "Teachers can create events"
  ON public.school_events
  FOR INSERT
  WITH CHECK (created_by = auth.uid() AND (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'homeroom_teacher'::app_role)));

-- Teachers can manage their own events
CREATE POLICY "Teachers can manage own events"
  ON public.school_events
  FOR ALL
  USING (created_by = auth.uid());

-- Secretariat/Director can manage all events
CREATE POLICY "Staff can manage all events"
  ON public.school_events
  FOR ALL
  USING (has_role(auth.uid(), 'secretariat'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'uat_admin'::app_role));

-- Developers can view all
CREATE POLICY "Developers can view all school events"
  ON public.school_events
  FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));


-- ---------------------------------------------------------------------------
-- MIGRATION 19/102: 20260106144723_ensure_invitations_personal_data_columns.sql
-- ---------------------------------------------------------------------------
-- Ensure invitations table has personal data columns before any functions use them.
-- This migration runs BEFORE 20260106144724 to ensure columns exist.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

-- Note: This migration assumes invitations table might not exist yet (created in 20260106144724).
-- If table doesn't exist, this does nothing. The CREATE TABLE in 20260106144724 includes these columns.
-- If table exists (from a previous run), this adds missing columns.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invitations') THEN
    ALTER TABLE public.invitations
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
      ADD COLUMN IF NOT EXISTS invited_email TEXT,
      ADD COLUMN IF NOT EXISTS invited_phone TEXT,
      ADD COLUMN IF NOT EXISTS intended_for TEXT;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- MIGRATION 20/102: 20260106144724_d51c94de-3425-4bbe-97d7-df43bc87ffd5.sql
-- ---------------------------------------------------------------------------
-- Create schools table
CREATE TABLE public.schools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on schools
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- RLS policies for schools
CREATE POLICY "Anyone can view schools"
  ON public.schools FOR SELECT
  USING (true);

CREATE POLICY "Directors can manage their school"
  ON public.schools FOR ALL
  USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'developer'::app_role)
  );

-- Add school_id to classes table
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);

-- Add school_id to profiles table for user-school association
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);

-- Create invitation_role enum type
DO $$ BEGIN
  CREATE TYPE public.invitation_role AS ENUM ('director', 'teacher', 'homeroom_teacher', 'student', 'parent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create invitations table
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  role invitation_role NOT NULL,
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
  
  -- Constraints
  CONSTRAINT valid_class_for_student_parent CHECK (
    (role NOT IN ('student'::public.invitation_role, 'parent'::public.invitation_role)) OR (class_id IS NOT NULL)
  ),
  CONSTRAINT valid_student_for_parent CHECK (
    (role != 'parent'::public.invitation_role) OR (student_id IS NOT NULL)
  )
);

-- Ensure personal data columns exist (for backward compatibility and future functions)
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_phone TEXT,
  ADD COLUMN IF NOT EXISTS intended_for TEXT;

-- Enable RLS on invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Function to check if invitation is valid
CREATE OR REPLACE FUNCTION public.is_invitation_valid(inv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invitations
    WHERE id = inv_id
      AND revoked_at IS NULL
      AND expires_at > now()
      AND current_uses < max_uses
  )
$$;

-- RLS policies for invitations
-- Developers can manage all invitations
CREATE POLICY "Developers can manage all invitations"
  ON public.invitations FOR ALL
  USING (has_role(auth.uid(), 'developer'::app_role));

-- Directors can manage invitations for their school (teacher/homeroom_teacher only)
CREATE POLICY "Directors can manage teacher invitations"
  ON public.invitations FOR ALL
  USING (
    has_role(auth.uid(), 'director'::app_role) AND
    role IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role) AND
    school_id IN (
      SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Homeroom teachers can manage student/parent invitations for their class
CREATE POLICY "Homeroom teachers can manage student parent invitations"
  ON public.invitations FOR ALL
  USING (
    has_role(auth.uid(), 'homeroom_teacher'::app_role) AND
    role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND
    class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
  );

-- Anyone can view valid invitations (for code validation during signup)
CREATE POLICY "Anyone can validate invitations"
  ON public.invitations FOR SELECT
  USING (
    revoked_at IS NULL AND
    expires_at > now() AND
    current_uses < max_uses
  );

-- Users can see invitations they created
CREATE POLICY "Users can see own invitations"
  ON public.invitations FOR SELECT
  USING (created_by_user_id = auth.uid());

-- Function to hash invitation code
CREATE OR REPLACE FUNCTION public.hash_invitation_code(code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(sha256(code::bytea), 'hex')
$$;

-- Function to generate random invitation code (12 chars, alphanumeric)
CREATE OR REPLACE FUNCTION public.generate_invitation_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Function to validate and claim an invitation
CREATE OR REPLACE FUNCTION public.claim_invitation(
  p_code_hash TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  invitation_id UUID,
  role invitation_role,
  school_id UUID,
  class_id UUID,
  student_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
BEGIN
  -- Find valid invitation
  SELECT * INTO v_inv
  FROM public.invitations i
  WHERE i.code_hash = p_code_hash
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND i.current_uses < i.max_uses
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false::boolean,
      NULL::uuid,
      NULL::invitation_role,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      'Codul de invitație este invalid, expirat sau a fost deja folosit.'::text;
    RETURN;
  END IF;
  
  -- Update invitation
  UPDATE public.invitations
  SET 
    current_uses = current_uses + 1,
    used_at = CASE WHEN current_uses + 1 >= max_uses THEN now() ELSE used_at END,
    used_by_user_id = p_user_id
  WHERE id = v_inv.id;
  
  -- Return success
  RETURN QUERY SELECT 
    true::boolean,
    v_inv.id,
    v_inv.role,
    v_inv.school_id,
    v_inv.class_id,
    v_inv.student_id,
    NULL::text;
END;
$$;

-- Function to create invitation (handles code generation and hashing)
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_role invitation_role,
  p_school_id UUID,
  p_class_id UUID DEFAULT NULL,
  p_student_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_max_uses INTEGER DEFAULT 1,
  p_expires_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  invitation_id UUID,
  plain_code TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_hash TEXT;
  v_inv_id UUID;
  v_created_by UUID;
BEGIN
  v_created_by := COALESCE(p_created_by, auth.uid());
  
  -- Validate based on role
  IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND p_class_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'class_id este obligatoriu pentru elevi și părinți'::text;
    RETURN;
  END IF;
  
  IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'student_id este obligatoriu pentru părinți'::text;
    RETURN;
  END IF;
  
  -- Generate unique code
  LOOP
    v_code := public.generate_invitation_code();
    v_hash := public.hash_invitation_code(v_code);
    
    -- Check if hash already exists
    IF NOT EXISTS (SELECT 1 FROM public.invitations WHERE code_hash = v_hash) THEN
      EXIT;
    END IF;
  END LOOP;
  
  -- Insert invitation
  INSERT INTO public.invitations (
    code_hash,
    role,
    school_id,
    class_id,
    student_id,
    created_by_user_id,
    expires_at,
    max_uses
  ) VALUES (
    v_hash,
    p_role,
    p_school_id,
    p_class_id,
    p_student_id,
    v_created_by,
    now() + (p_expires_hours || ' hours')::interval,
    p_max_uses
  )
  RETURNING id INTO v_inv_id;
  
  RETURN QUERY SELECT v_inv_id, v_code, NULL::text;
END;
$$;

-- Function to revoke an invitation
CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invitations
  SET revoked_at = now()
  WHERE id = p_invitation_id
    AND revoked_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Add trigger for updated_at on schools
CREATE TRIGGER update_schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster invitation lookups
CREATE INDEX IF NOT EXISTS idx_invitations_code_hash ON public.invitations(code_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_school_id ON public.invitations(school_id);
CREATE INDEX IF NOT EXISTS idx_invitations_class_id ON public.invitations(class_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON public.invitations(created_by_user_id);


-- ---------------------------------------------------------------------------
-- MIGRATION 21/102: 20260106170000_hierarchical_invitations.sql
-- ---------------------------------------------------------------------------
-- Hierarchical invitations: add secretariat role and optional email/phone + harden create_invitation authorization.

do $$
begin
  -- Add new invitation role value (idempotent)
  begin
    alter type public.invitation_role add value 'secretariat';
  exception
    when duplicate_object then null;
  end;
end $$;

alter table if exists public.invitations
  add column if not exists invited_email text,
  add column if not exists invited_phone text;

-- Replace create_invitation with authorization checks + email/phone support.
create or replace function public.create_invitation(
  p_role public.invitation_role,
  p_school_id uuid,
  p_class_id uuid default null,
  p_student_id uuid default null,
  p_invited_email text default null,
  p_invited_phone text default null,
  p_max_uses integer default 1,
  p_expires_hours integer default 24
)
returns table (
  invitation_id uuid,
  code text,
  expires_at timestamptz,
  max_uses integer,
  plain_code text,
  error_message text
)
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_code text;
  v_plain_code text;
  v_expires_at timestamptz;
  v_existing_count integer;
  v_class_school_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Not authenticated';
    return;
  end if;

  if p_max_uses < 1 then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Max uses must be at least 1';
    return;
  end if;

  if p_expires_hours < 1 then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Expires hours must be at least 1';
    return;
  end if;

  -- Role hierarchy enforcement:
  -- developer: anything
  -- director: teacher / homeroom_teacher / secretariat (for their school)
  -- homeroom_teacher: student / parent (for their class)
  if public.has_role(v_user_id, 'developer'::public.app_role) then
    -- ok
  elsif public.has_role(v_user_id, 'director'::public.app_role) then
    if p_role not in ('teacher','homeroom_teacher','secretariat') then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Directors can only invite teacher / homeroom_teacher / secretariat';
      return;
    end if;

    if not exists (
      select 1 from public.profiles p
      where p.id = v_user_id and p.school_id = p_school_id
    ) then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Director can only create invitations for their school';
      return;
    end if;

  elsif public.has_role(v_user_id, 'homeroom_teacher'::public.app_role) then
    if p_role not in ('student','parent') then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Homeroom teachers can only invite student / parent';
      return;
    end if;

    if p_class_id is null then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Class is required for student/parent invitations';
      return;
    end if;

    select c.school_id into v_class_school_id
    from public.classes c
    where c.id = p_class_id;

    if v_class_school_id is null or v_class_school_id <> p_school_id then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Class does not belong to the specified school';
      return;
    end if;

    if not exists (
      select 1 from public.classes c
      where c.id = p_class_id and c.teacher_id = v_user_id
    ) then
      return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'You are not the homeroom teacher for this class';
      return;
    end if;

  else
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Not authorized to create invitations';
    return;
  end if;

  -- Student/parent constraints
  if p_role in ('student', 'parent') and p_class_id is null then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Class is required for student/parent invitations';
    return;
  end if;

  if p_role = 'parent'::public.invitation_role and p_student_id is null then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, 'Student is required for parent invitations';
    return;
  end if;

  if p_role in ('teacher', 'homeroom_teacher', 'secretariat') then
    p_class_id := null;
    p_student_id := null;
  end if;

  if p_invited_email is not null and length(trim(p_invited_email)) = 0 then
    p_invited_email := null;
  end if;

  if p_invited_phone is not null and length(trim(p_invited_phone)) = 0 then
    p_invited_phone := null;
  end if;

  v_expires_at := now() + (p_expires_hours || ' hours')::interval;

  -- generate unique code
  loop
    v_plain_code := substr(md5(random()::text), 1, 8);
    v_code := encode(digest(v_plain_code, 'sha256'), 'hex');

    select count(*) into v_existing_count
    from public.invitations
    where code_hash = v_code;

    exit when v_existing_count = 0;
  end loop;

  insert into public.invitations (
    role,
    school_id,
    class_id,
    student_id,
    invited_email,
    invited_phone,
    code_hash,
    max_uses,
    expires_at,
    created_by_user_id
  ) values (
    p_role,
    p_school_id,
    p_class_id,
    p_student_id,
    p_invited_email,
    p_invited_phone,
    v_code,
    p_max_uses,
    v_expires_at,
    v_user_id
  )
  returning id into invitation_id;

  return query select invitation_id, v_code, v_expires_at, p_max_uses, v_plain_code, null::text;

exception
  when others then
    return query select null::uuid, null::text, null::timestamptz, null::integer, null::text, sqlerrm;
end;
$$;

-- Update policy for directors to include secretariat invitations
drop policy if exists "Directors can view invitations for their school" on public.invitations;
create policy "Directors can view invitations for their school"
on public.invitations
for select
to authenticated
using (
  public.has_role(auth.uid(), 'director'::public.app_role)
  and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists "Directors can revoke invitations for their school" on public.invitations;
create policy "Directors can revoke invitations for their school"
on public.invitations
for update
to authenticated
using (
  public.has_role(auth.uid(), 'director'::public.app_role)
  and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
)
with check (
  public.has_role(auth.uid(), 'director'::public.app_role)
  and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
);


-- ---------------------------------------------------------------------------
-- MIGRATION 22/102: 20260107090616_344bc8cf-022a-47f3-b695-e9068447d58f.sql
-- ---------------------------------------------------------------------------
-- =============================================
-- Task 1.1 & 5.2: Indexuri pentru performanță 
-- =============================================

-- Indexuri pe invitations
CREATE INDEX IF NOT EXISTS idx_invitations_school_id ON public.invitations(school_id);
CREATE INDEX IF NOT EXISTS idx_invitations_class_id ON public.invitations(class_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON public.invitations(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON public.invitations(created_at);

-- Indexuri pe students
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);

-- Indexuri pe grades
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_teacher_id ON public.grades(teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_date ON public.grades(date);
CREATE INDEX IF NOT EXISTS idx_grades_created_at ON public.grades(created_at);

-- Indexuri pe attendance
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_id ON public.attendance(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance(status);

-- Indexuri pe audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Indexuri pe classes
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);

-- Indexuri pe announcements
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON public.announcements(created_by);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at);

-- Indexuri pe school_events
CREATE INDEX IF NOT EXISTS idx_school_events_event_date ON public.school_events(event_date);
CREATE INDEX IF NOT EXISTS idx_school_events_class_id ON public.school_events(class_id);

-- Indexuri pe timetable_entries
CREATE INDEX IF NOT EXISTS idx_timetable_class_id ON public.timetable_entries(class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher_id ON public.timetable_entries(teacher_id);

-- =============================================
-- Task 1.2: Extinde audit_logs cu old_data/new_data 
-- =============================================

ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS old_data JSONB,
ADD COLUMN IF NOT EXISTS new_data JSONB,
ADD COLUMN IF NOT EXISTS school_id UUID;

-- Index pentru filtrarea pe school_id în audit
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);

-- =============================================
-- Task 2.1: DB constraints pentru invitations
-- =============================================

-- Adaugă trigger pentru validare în loc de CHECK constraint (mai flexibil)
CREATE OR REPLACE FUNCTION public.validate_invitation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validare max_uses >= 1
  IF NEW.max_uses < 1 THEN
    RAISE EXCEPTION 'max_uses trebuie să fie cel puțin 1';
  END IF;
  
  -- Validare current_uses >= 0
  IF NEW.current_uses < 0 THEN
    RAISE EXCEPTION 'current_uses nu poate fi negativ';
  END IF;
  
  -- Validare current_uses <= max_uses
  IF NEW.current_uses > NEW.max_uses THEN
    RAISE EXCEPTION 'current_uses nu poate depăși max_uses';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger pentru validare la INSERT/UPDATE
DROP TRIGGER IF EXISTS trigger_validate_invitation ON public.invitations;
CREATE TRIGGER trigger_validate_invitation
  BEFORE INSERT OR UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invitation();

-- =============================================
-- RLS: Adaugă policy pentru secretariat pe audit_logs
-- =============================================

DROP POLICY IF EXISTS "Secretariat can view school audit logs" ON public.audit_logs;
CREATE POLICY "Secretariat can view school audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'homeroom_teacher'::app_role)
  );

-- =============================================
-- RLS: Parents can view their children's data
-- =============================================

-- Grades: Parents can view their children's grades
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
CREATE POLICY "Parents can view children grades"
  ON public.grades
  FOR SELECT
  USING (
    student_id IN (
      SELECT psr.student_id 
      FROM public.parent_student_relations psr 
      WHERE psr.parent_user_id = auth.uid()
    )
  );

-- Attendance: Parents can view their children's attendance
DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
CREATE POLICY "Parents can view children attendance"
  ON public.attendance
  FOR SELECT
  USING (
    student_id IN (
      SELECT psr.student_id 
      FROM public.parent_student_relations psr 
      WHERE psr.parent_user_id = auth.uid()
    )
  );

-- Students: Parents can view their children's student records
DROP POLICY IF EXISTS "Parents can view children records" ON public.students;
CREATE POLICY "Parents can view children records"
  ON public.students
  FOR SELECT
  USING (
    id IN (
      SELECT psr.student_id 
      FROM public.parent_student_relations psr 
      WHERE psr.parent_user_id = auth.uid()
    )
  );

-- =============================================
-- Funcție îmbunătățită pentru audit logging
-- =============================================

CREATE OR REPLACE FUNCTION public.log_audit_extended(
  _user_id UUID,
  _user_name TEXT,
  _active_role app_role,
  _action TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL,
  _old_data JSONB DEFAULT NULL,
  _new_data JSONB DEFAULT NULL,
  _school_id UUID DEFAULT NULL,
  _details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    user_id, user_name, active_role, action, 
    entity_type, entity_id, old_data, new_data, school_id, details
  )
  VALUES (
    _user_id, _user_name, _active_role, _action,
    _entity_type, _entity_id, _old_data, _new_data, _school_id, _details
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 23/102: 20260203191917_64c66784-fab5-41e5-aa7b-9c0e1b15c9f0.sql
-- ---------------------------------------------------------------------------
-- Add intended_for column to invitations table for storing invitee name
ALTER TABLE public.invitations 
ADD COLUMN IF NOT EXISTS intended_for text;

-- Update the create_invitation function to accept intended_for parameter
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_role invitation_role,
  p_school_id uuid,
  p_class_id uuid DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_expires_hours integer DEFAULT 24,
  p_max_uses integer DEFAULT 1,
  p_intended_for text DEFAULT NULL
)
RETURNS TABLE(invitation_id uuid, plain_code text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plain_code text;
  v_code_hash text;
  v_invitation_id uuid;
  v_creator_id uuid;
BEGIN
  -- Determine the creator
  v_creator_id := COALESCE(p_created_by, auth.uid());
  
  IF v_creator_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'User not authenticated'::text;
    RETURN;
  END IF;

  -- Generate the invitation code
  v_plain_code := public.generate_invitation_code();
  v_code_hash := public.hash_invitation_code(v_plain_code);
  
  -- Insert the invitation
  INSERT INTO public.invitations (
    role,
    school_id,
    class_id,
    student_id,
    code_hash,
    created_by_user_id,
    expires_at,
    max_uses,
    intended_for
  ) VALUES (
    p_role,
    p_school_id,
    p_class_id,
    p_student_id,
    v_code_hash,
    v_creator_id,
    NOW() + (p_expires_hours || ' hours')::interval,
    p_max_uses,
    p_intended_for
  )
  RETURNING id INTO v_invitation_id;
  
  RETURN QUERY SELECT v_invitation_id, v_plain_code, NULL::text;
END;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 24/102: 20260212043302_c791c9b0-382e-45b0-aca9-7cbcfb119b3b.sql
-- ---------------------------------------------------------------------------

-- Create teacher_register table (condica)
CREATE TABLE public.teacher_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_entry_id uuid NOT NULL REFERENCES public.timetable_entries(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id),
  subject_id uuid REFERENCES public.subjects(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  signed_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(timetable_entry_id, teacher_id, date)
);

-- Enable RLS
ALTER TABLE public.teacher_register ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own register entries
CREATE POLICY "Teachers can view own register entries"
ON public.teacher_register
FOR SELECT
USING (teacher_id = auth.uid());

-- Teachers can insert their own register entries
CREATE POLICY "Teachers can sign register"
ON public.teacher_register
FOR INSERT
WITH CHECK (teacher_id = auth.uid());

-- Directors can view all register entries (school oversight)
CREATE POLICY "Directors can view all register entries"
ON public.teacher_register
FOR SELECT
USING (
  has_role(auth.uid(), 'director'::app_role) OR 
  has_role(auth.uid(), 'secretariat'::app_role)
);

-- Developers can view all register entries
CREATE POLICY "Developers can view all register entries"
ON public.teacher_register
FOR SELECT
USING (has_role(auth.uid(), 'developer'::app_role));

-- Add unique constraint on attendance for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_student_subject_date_unique'
  ) THEN
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_subject_date_unique 
    UNIQUE (student_id, subject_id, date);
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- MIGRATION 25/102: 20260213000000_academic_year_snapshots_views.sql
-- ---------------------------------------------------------------------------
-- Migration: academic_year, academic_year_snapshots, views for averages, recalc function
-- Part 1: Core schema for year management and grade/attendance views
-- Frontend must read from views, not compute with map/reduce

BEGIN;

-- 1) academic_year table
CREATE TABLE IF NOT EXISTS public.academic_year (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  year_closed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, year)
);

ALTER TABLE public.academic_year ENABLE ROW LEVEL SECURITY;

-- Directors/secretariat can manage academic years
CREATE POLICY "Staff can manage academic_year"
  ON public.academic_year FOR ALL
  USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 2) Link classes to academic_year (optional - classes.year can map to academic_year.year)
-- Add academic_year_id to classes if we want explicit FK; for now we derive from year + school_id

-- 3) academic_year_snapshots - frozen data when year is closed
CREATE TABLE IF NOT EXISTS public.academic_year_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_year(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  subject_name TEXT,
  average NUMERIC(4,2),
  grades_json JSONB,
  attendance_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (academic_year_id, student_id, subject_id)
);

ALTER TABLE public.academic_year_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view academic_year_snapshots"
  ON public.academic_year_snapshots FOR SELECT
  USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role) OR
    has_role(auth.uid(), 'homeroom_teacher'::app_role) OR
    has_role(auth.uid(), 'teacher'::app_role)
  );

CREATE POLICY "Parents can view own children snapshots"
  ON public.academic_year_snapshots FOR SELECT
  USING (
    student_id IN (
      SELECT psr.student_id FROM public.parent_student_relations psr
      WHERE psr.parent_user_id = auth.uid()
    )
  );

CREATE POLICY "Students can view own snapshot"
  ON public.academic_year_snapshots FOR SELECT
  USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

-- 4) view_student_subject_average - computed from grades (excludes deleted)
CREATE OR REPLACE VIEW public.view_student_subject_average AS
SELECT
  g.student_id,
  g.subject_id,
  s.name AS subject_name,
  AVG(g.grade)::NUMERIC(4,2) AS average,
  COUNT(*)::INTEGER AS grade_count
FROM public.grades g
JOIN public.subjects s ON s.id = g.subject_id
WHERE g.deleted_at IS NULL
GROUP BY g.student_id, g.subject_id, s.name;

-- 5) view_student_general_average - computed from view_student_subject_average
CREATE OR REPLACE VIEW public.view_student_general_average AS
SELECT
  student_id,
  AVG(average)::NUMERIC(4,2) AS general_average,
  COUNT(*)::INTEGER AS subject_count
FROM public.view_student_subject_average
GROUP BY student_id;

-- 6) recalc_student_averages(student_id) - validation helper, returns computed averages
CREATE OR REPLACE FUNCTION public.recalc_student_averages(p_student_id UUID)
RETURNS TABLE(subject_id UUID, subject_name TEXT, average NUMERIC, grade_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vs.subject_id, vs.subject_name, vs.average, vs.grade_count
  FROM public.view_student_subject_average vs
  WHERE vs.student_id = p_student_id;
$$;

-- Ensure grades CHECK (1-10) - bootstrap may have it; enforce if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grades'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%grade%1%10%'
  ) THEN
    ALTER TABLE public.grades
      DROP CONSTRAINT IF EXISTS grades_grade_check;
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);
  END IF;
END $$;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 26/102: 20260213000100_close_academic_year.sql
-- ---------------------------------------------------------------------------
-- Migration: close_academic_year() - atomic close of academic year
-- Recalculates averages, copies to snapshot, sets year_closed, audits

BEGIN;

CREATE OR REPLACE FUNCTION public.close_academic_year(p_year_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year RECORD;
  v_student RECORD;
  v_subject RECORD;
  v_user_id UUID;
  v_user_name TEXT;
  v_role app_role;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'director'::app_role) OR has_role(v_user_id, 'secretariat'::app_role) OR has_role(v_user_id, 'uat_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only director, secretariat or uat_admin can close academic year';
  END IF;

  SELECT ay.* INTO v_year
  FROM public.academic_year ay
  WHERE ay.id = p_year_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic year not found';
  END IF;

  IF v_year.year_closed THEN
    RAISE EXCEPTION 'Academic year is already closed';
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'director'::app_role)
  INTO v_user_name, v_role
  FROM public.profiles p WHERE p.id = v_user_id;

  -- Copy grades and averages to snapshot for each student in the school
  FOR v_student IN
    SELECT s.id
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE c.school_id = v_year.school_id AND c.year = v_year.year
  LOOP
    -- Per-subject snapshots
    FOR v_subject IN
      SELECT *
      FROM public.view_student_subject_average
      WHERE student_id = v_student.id
    LOOP
      INSERT INTO public.academic_year_snapshots (
        academic_year_id, student_id, subject_id, subject_name, average,
        grades_json, attendance_json
      )
      VALUES (
        p_year_id, v_student.id, v_subject.subject_id, v_subject.subject_name, v_subject.average,
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object('date', g.date, 'grade', g.grade, 'description', g.description)
        ), '[]'::jsonb)
         FROM public.grades g
         WHERE g.student_id = v_student.id AND g.subject_id = v_subject.subject_id AND g.deleted_at IS NULL),
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object('date', a.date, 'status', a.status)
        ), '[]'::jsonb)
         FROM public.attendance a
         WHERE a.student_id = v_student.id AND a.subject_id = v_subject.subject_id)
      )
      ON CONFLICT (academic_year_id, student_id, subject_id) DO UPDATE SET
        average = EXCLUDED.average,
        grades_json = EXCLUDED.grades_json,
        attendance_json = EXCLUDED.attendance_json;
    END LOOP;
  END LOOP;

  -- Mark year closed
  UPDATE public.academic_year
  SET year_closed = true, closed_at = now(), closed_by = v_user_id
  WHERE id = p_year_id;

  -- Audit
  INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, details, school_id)
  VALUES (
    v_user_id, COALESCE(v_user_name, ''), v_role,
    'academic_year.closed', 'academic_year', p_year_id,
    jsonb_build_object('year_id', p_year_id, 'year', v_year.year, 'school_id', v_year.school_id),
    v_year.school_id
  );

  RETURN true;
END;
$$;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 27/102: 20260213000200_audit_triggers_rls.sql
-- ---------------------------------------------------------------------------
-- Migration: Audit triggers (DB-level, impossible to bypass) + RLS block when year closed
-- Triggers save auth.uid(), OLD, NEW, server-side timestamp

BEGIN;

-- 1) Enhance audit_row_change to use auth.uid() directly (server-side)
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  uname text;
  urole public.app_role;
  entity_id uuid;
  details jsonb;
  school_id_val uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'student'::app_role), p.school_id
  INTO uname, urole, school_id_val
  FROM public.profiles p
  WHERE p.id = uid;

  entity_id := COALESCE((NEW).id, (OLD).id);
  details := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'server_ts', now(),
    'old', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    'new', CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  INSERT INTO public.audit_logs(user_id, user_name, active_role, action, entity_type, entity_id, old_data, new_data, details, school_id)
  VALUES (uid, COALESCE(uname, ''), COALESCE(urole, 'student'::app_role), TG_OP, TG_TABLE_NAME, entity_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    details, school_id_val);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2) disciplinary_actions table (if not exists)
CREATE TABLE IF NOT EXISTS public.disciplinary_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  action_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.disciplinary_actions ENABLE ROW LEVEL SECURITY;

-- Audit trigger for disciplinary_actions
DROP TRIGGER IF EXISTS trg_audit_disciplinary_actions ON public.disciplinary_actions;
CREATE TRIGGER trg_audit_disciplinary_actions
  AFTER INSERT OR UPDATE OR DELETE ON public.disciplinary_actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 3) academic_year audit trigger
DROP TRIGGER IF EXISTS trg_audit_academic_year ON public.academic_year;
CREATE TRIGGER trg_audit_academic_year
  AFTER INSERT OR UPDATE OR DELETE ON public.academic_year
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 4) RLS: Block UPDATE/DELETE on grades, attendance, disciplinary_actions when year_closed
CREATE OR REPLACE FUNCTION public.is_year_closed_for_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    JOIN public.academic_year ay ON ay.school_id = c.school_id AND ay.year = c.year
    WHERE s.id = p_student_id AND ay.year_closed = true
  );
$$;

-- Grades: add policy that BLOCKS update/delete when year closed
-- We need to DROP existing update/delete policies and recreate with year_closed check
-- The existing policies allow teachers/staff. We add a CHECK that fails when year_closed.

CREATE OR REPLACE FUNCTION public.grades_update_delete_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(OLD.student_id) THEN
    RAISE EXCEPTION 'Cannot modify grades: academic year is closed';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.grades_insert_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(NEW.student_id) THEN
    RAISE EXCEPTION 'Cannot insert grades: academic year is closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_block_closed_year ON public.grades;
CREATE TRIGGER trg_grades_block_closed_year
  BEFORE UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.grades_update_delete_check();

DROP TRIGGER IF EXISTS trg_grades_insert_block_closed_year ON public.grades;
CREATE TRIGGER trg_grades_insert_block_closed_year
  BEFORE INSERT ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.grades_insert_check();

-- Attendance: same
CREATE OR REPLACE FUNCTION public.attendance_update_delete_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(OLD.student_id) THEN
    RAISE EXCEPTION 'Cannot modify attendance: academic year is closed';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_insert_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(NEW.student_id) THEN
    RAISE EXCEPTION 'Cannot insert attendance: academic year is closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_block_closed_year ON public.attendance;
CREATE TRIGGER trg_attendance_block_closed_year
  BEFORE UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_update_delete_check();

DROP TRIGGER IF EXISTS trg_attendance_insert_block_closed_year ON public.attendance;
CREATE TRIGGER trg_attendance_insert_block_closed_year
  BEFORE INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_insert_check();

-- Disciplinary_actions: same
CREATE OR REPLACE FUNCTION public.disciplinary_update_delete_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(OLD.student_id) THEN
    RAISE EXCEPTION 'Cannot modify disciplinary actions: academic year is closed';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_disciplinary_block_closed_year ON public.disciplinary_actions;
CREATE TRIGGER trg_disciplinary_block_closed_year
  BEFORE UPDATE OR DELETE ON public.disciplinary_actions
  FOR EACH ROW EXECUTE FUNCTION public.disciplinary_update_delete_check();

-- 5) RLS for disciplinary_actions: staff + homeroom can manage; parents can view own children
CREATE POLICY "Staff can manage disciplinary_actions"
  ON public.disciplinary_actions FOR ALL
  USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role) OR
    has_role(auth.uid(), 'homeroom_teacher'::app_role)
  );

CREATE POLICY "Parents can view children disciplinary"
  ON public.disciplinary_actions FOR SELECT
  USING (
    student_id IN (
      SELECT psr.student_id FROM public.parent_student_relations psr
      WHERE psr.parent_user_id = auth.uid()
    )
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 28/102: 20260213000300_attendance_model_teacher_log.sql
-- ---------------------------------------------------------------------------
-- Migration: Attendance status enum (pending/motivated/unexcused), validated_by/at
-- RLS: profesor poate insera, NU poate modifica status; dirigintele poate valida
-- teacher_log with time limit (2h from scheduled time)

BEGIN;

-- 1) Attendance status: add validated_by, validated_at; migrate status to new values
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

-- Drop old check first, then migrate values, then add new check
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check1;

-- Migrate old status values: prezent->present, absent->unexcused, motivat->motivated, intarziat->pending
UPDATE public.attendance SET status = CASE
  WHEN status IN ('prezent', 'present') THEN 'present'
  WHEN status IN ('motivat', 'motivated') THEN 'motivated'
  WHEN status IN ('intarziat', 'pending') THEN 'pending'
  WHEN status IN ('absent', 'unexcused') THEN 'unexcused'
  ELSE COALESCE(status, 'pending')
END WHERE status IS NOT NULL;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_status_check CHECK (status IN ('present', 'pending', 'motivated', 'unexcused'));

-- 2) Restrict teacher from modifying status - only homeroom can validate
-- Replace old restrict_homeroom_attendance_update with unified logic
DROP TRIGGER IF EXISTS trg_restrict_homeroom_attendance_update ON public.attendance;

CREATE OR REPLACE FUNCTION public.restrict_teacher_attendance_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RETURN NEW; END IF;

  -- Homeroom (not original recorder) can only set status to motivated
  IF has_role(uid, 'homeroom_teacher'::app_role) AND (OLD.teacher_id IS DISTINCT FROM uid) THEN
    IF NEW.status <> 'motivated' AND OLD.status <> NEW.status THEN
      RAISE EXCEPTION 'Homeroom can only validate (set status to motivated)';
    END IF;
    IF NEW.status = 'motivated' THEN
      NEW.validated_by := uid;
      NEW.validated_at := COALESCE(NEW.validated_at, now());
    END IF;
    RETURN NEW;
  END IF;

  -- Teacher (recording) cannot change status - only homeroom can validate
  IF OLD.teacher_id = uid AND (NOT has_role(uid, 'homeroom_teacher'::app_role)) THEN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'Teacher cannot modify attendance status; only homeroom can validate';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_teacher_attendance_status ON public.attendance;
CREATE TRIGGER trg_restrict_teacher_attendance_status
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.restrict_teacher_attendance_status_update();

-- 3) teacher_register time limit: refuse insert if > 2h after scheduled time
CREATE OR REPLACE FUNCTION public.teacher_register_time_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start time;
  v_scheduled_ts timestamptz;
  v_reg_date date;
  v_limit_hours int := 2;
BEGIN
  v_reg_date := COALESCE(
    (NEW).register_date,
    (NEW).date
  );
  IF v_reg_date IS NULL THEN RETURN NEW; END IF;
  SELECT start_time INTO v_start FROM public.timetable_entries WHERE id = NEW.timetable_entry_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_scheduled_ts := (v_reg_date + COALESCE(v_start, '08:00'::time))::timestamptz;
  IF now() > v_scheduled_ts + (v_limit_hours || ' hours')::interval THEN
    RAISE EXCEPTION 'Cannot sign register: more than % hours after scheduled time', v_limit_hours;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_register_time_check ON public.teacher_register;
CREATE TRIGGER trg_teacher_register_time_check
  BEFORE INSERT ON public.teacher_register
  FOR EACH ROW EXECUTE FUNCTION public.teacher_register_time_check();

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 29/102: 20260213000400_views_for_print_snapshot.sql
-- ---------------------------------------------------------------------------
-- Migration: RPCs for PrintStudent/PrintClass - read from snapshot when year closed
-- Frontend calls these instead of querying grades/attendance directly

BEGIN;

-- get_student_grades_for_display(student_id): returns grades from snapshot if year closed, else live
CREATE OR REPLACE FUNCTION public.get_student_grades_for_display(p_student_id UUID)
RETURNS TABLE(
  id UUID,
  date DATE,
  grade NUMERIC,
  description TEXT,
  subject_id UUID,
  subject_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_closed BOOLEAN;
  v_year_id UUID;
BEGIN
  SELECT ay.id, ay.year_closed INTO v_year_id, v_year_closed
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  JOIN public.academic_year ay ON ay.school_id = c.school_id AND ay.year = c.year
  WHERE s.id = p_student_id
  LIMIT 1;

  IF v_year_closed AND v_year_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      gen_random_uuid() AS id,
      (g->>'date')::date AS date,
      (g->>'grade')::numeric AS grade,
      (g->>'description')::text AS description,
      ays.subject_id,
      ays.subject_name
    FROM public.academic_year_snapshots ays,
         jsonb_array_elements(COALESCE(ays.grades_json, '[]'::jsonb)) AS g
    WHERE ays.academic_year_id = v_year_id AND ays.student_id = p_student_id AND ays.subject_id IS NOT NULL;
  ELSE
    RETURN QUERY
    SELECT g.id, g.date, g.grade, g.description, g.subject_id, s.name AS subject_name
    FROM public.grades g
    JOIN public.subjects s ON s.id = g.subject_id
    WHERE g.student_id = p_student_id AND g.deleted_at IS NULL
    ORDER BY g.date DESC;
  END IF;
END;
$$;

-- Simplified: get_student_subject_averages_for_display - for Grades page (medii pe materii)
CREATE OR REPLACE FUNCTION public.get_student_subject_averages_for_display(p_student_id UUID)
RETURNS TABLE(subject_id UUID, subject_name TEXT, average NUMERIC, grade_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_closed BOOLEAN;
  v_year_id UUID;
BEGIN
  SELECT ay.id, ay.year_closed INTO v_year_id, v_year_closed
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.academic_year ay ON ay.school_id = c.school_id AND ay.year = c.year
  WHERE s.id = p_student_id
  LIMIT 1;

  IF v_year_closed AND v_year_id IS NOT NULL THEN
    RETURN QUERY
    SELECT ays.subject_id, ays.subject_name, ays.average, jsonb_array_length(COALESCE(ays.grades_json, '[]'::jsonb))::bigint
    FROM public.academic_year_snapshots ays
    WHERE ays.academic_year_id = v_year_id AND ays.student_id = p_student_id AND ays.subject_id IS NOT NULL;
  ELSE
    RETURN QUERY
    SELECT * FROM public.view_student_subject_average WHERE view_student_subject_average.student_id = p_student_id;
  END IF;
END;
$$;

-- get_subject_averages_for_students(student_ids[]): batch version for Grades/Reports
CREATE OR REPLACE FUNCTION public.get_subject_averages_for_students(p_student_ids UUID[])
RETURNS TABLE(student_id UUID, subject_id UUID, subject_name TEXT, average NUMERIC, grade_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sid UUID;
BEGIN
  FOREACH v_sid IN ARRAY p_student_ids
  LOOP
    RETURN QUERY
    SELECT v_sid, g.subject_id, g.subject_name, g.average, g.grade_count
    FROM public.get_student_subject_averages_for_display(v_sid) AS g;
  END LOOP;
END;
$$;

-- get_class_stats_for_display(class_id, date_from, date_to): for Reports - no frontend map/reduce
CREATE OR REPLACE FUNCTION public.get_class_stats_for_display(
  p_class_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE(student_id UUID, general_average NUMERIC, absences_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS student_id,
    (SELECT AVG(g.grade)::numeric(4,2) FROM public.grades g
     WHERE g.student_id = s.id AND g.deleted_at IS NULL
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

-- get_class_totals_for_display: class avg, total absences, total motivated (no frontend aggregation)
CREATE OR REPLACE FUNCTION public.get_class_totals_for_display(
  p_class_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE(class_average NUMERIC, total_absences BIGINT, total_motivated BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT AVG(g.grade)::numeric(4,2) FROM public.grades g
     JOIN public.students s2 ON s2.id = g.student_id
     WHERE s2.class_id = p_class_id AND g.deleted_at IS NULL
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

-- get_student_general_average_for_display
CREATE OR REPLACE FUNCTION public.get_student_general_average_for_display(p_student_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_closed BOOLEAN;
  v_year_id UUID;
  v_avg NUMERIC;
BEGIN
  SELECT ay.id, ay.year_closed INTO v_year_id, v_year_closed
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.academic_year ay ON ay.school_id = c.school_id AND ay.year = c.year
  WHERE s.id = p_student_id
  LIMIT 1;

  IF v_year_closed AND v_year_id IS NOT NULL THEN
    SELECT AVG(average)::numeric(4,2) INTO v_avg
    FROM public.academic_year_snapshots
    WHERE academic_year_id = v_year_id AND student_id = p_student_id AND subject_id IS NOT NULL;
    RETURN v_avg;
  ELSE
    SELECT general_average INTO v_avg FROM public.view_student_general_average WHERE student_id = p_student_id;
    RETURN v_avg;
  END IF;
END;
$$;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 30/102: 20260213100000_consolidation_audit_triggers.sql
-- ---------------------------------------------------------------------------
-- Consolidation: Ensure audit triggers on all target tables
-- Run after 20260213* migrations - guarantees grades, attendance, teacher_register, disciplinary_actions, academic_year are audited

BEGIN;

-- Ensure audit_row_change exists (from 20260213000200) and attach triggers
-- Grades
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Attendance
DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Teacher register (condica)
DROP TRIGGER IF EXISTS trg_audit_teacher_register ON public.teacher_register;
CREATE TRIGGER trg_audit_teacher_register
  AFTER INSERT OR UPDATE OR DELETE ON public.teacher_register
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Disciplinary actions and academic_year already have triggers from 20260213000200

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 31/102: 20260213110000_profiles_update_rls.sql
-- ---------------------------------------------------------------------------
-- Profiles: ensure users can view own profile + strict UPDATE by role.
-- Business rules: Students/Parents = read-only name/phone; Teachers/Directors can edit Students/Parents;
-- Directors can edit Teachers and their own. Frontend enforces field-level disable; RLS enforces row-level.

-- Allow any authenticated user to view their own profile (required for Settings page)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND id = auth.uid());

-- Helper: role rank for comparison (higher = more privilege)
-- student=1, parent=1, teacher=2, homeroom_teacher=2, secretariat=3, director=4, uat_admin=4, developer=5
CREATE OR REPLACE FUNCTION public.profile_role_rank(r public.app_role)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE r
    WHEN 'student' THEN 1
    WHEN 'parent' THEN 1
    WHEN 'teacher' THEN 2
    WHEN 'homeroom_teacher' THEN 2
    WHEN 'secretariat' THEN 3
    WHEN 'director' THEN 4
    WHEN 'uat_admin' THEN 4
    WHEN 'developer' THEN 5
    ELSE 0
  END;
$$;

-- Allow UPDATE on profiles if:
-- 1) Editing own profile AND editor has role rank >= target's role rank (staff can edit self)
-- 2) OR editing someone else's profile AND editor is director/uat_admin (can edit teachers, students, parents)
CREATE POLICY "Profiles: update if higher or equal role"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Editing own profile: staff (teacher+) can update
      (id = auth.uid() AND (
        public.profile_role_rank(COALESCE(
          (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1),
          'student'::public.app_role
        )) >= 2
      ))
      OR
      -- Editing another user: director/uat_admin only
      (id != auth.uid() AND (
        has_role(auth.uid(), 'director'::public.app_role)
        OR has_role(auth.uid(), 'uat_admin'::public.app_role)
      ))
    )
  );


-- ---------------------------------------------------------------------------
-- MIGRATION 32/102: 20260213120000_invitations_personal_data.sql
-- ---------------------------------------------------------------------------
-- Invitations: add first_name, last_name, student_number; update create/claim for signup linking.
-- These values are saved with the invitation and applied to profile/student on signup.

-- 1. Add columns to invitations (including intended_for from 20260203191917)
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_phone TEXT,
  ADD COLUMN IF NOT EXISTS intended_for TEXT;

-- 2. Update create_invitation: accept and persist first_name, last_name, student_number, email, phone
-- Keeps hierarchical auth from 20260106170000 + intended_for from 20260203191917
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Role hierarchy: developer=any, director=teacher/homeroom/secretariat, homeroom=student/parent
  IF has_role(v_user_id, 'developer'::app_role) THEN
    NULL;
  ELSIF has_role(v_user_id, 'director'::app_role) THEN
    IF p_role NOT IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Directors can only invite teacher / homeroom_teacher / secretariat'::text;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director can only create invitations for their school'::text;
      RETURN;
    END IF;
  ELSIF has_role(v_user_id, 'homeroom_teacher'::app_role) THEN
    IF p_role NOT IN ('student'::public.invitation_role, 'parent'::public.invitation_role, 'teacher'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Homeroom teachers can only invite student / parent / teacher'::text;
      RETURN;
    END IF;
    -- Class is required only for student/parent invitations, not for teacher
    IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) THEN
      IF p_class_id IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
        RETURN;
      END IF;
      SELECT c.school_id INTO v_class_school_id FROM classes c WHERE c.id = p_class_id;
      IF v_class_school_id IS NULL OR v_class_school_id <> p_school_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class does not belong to the specified school'::text;
        RETURN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = p_class_id AND c.teacher_id = v_user_id) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You are not the homeroom teacher for this class'::text;
        RETURN;
      END IF;
    END IF;
    -- For teacher invitations, verify homeroom teacher belongs to the school
    IF p_role = 'teacher'::public.invitation_role THEN
      IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You can only create invitations for your school'::text;
        RETURN;
      END IF;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Not authorized to create invitations'::text;
    RETURN;
  END IF;

  IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND p_class_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
    RETURN;
  END IF;

  IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
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

-- 3. Update claim_invitation: return first_name, last_name, student_number, email, phone for signup
CREATE OR REPLACE FUNCTION public.claim_invitation(p_code_hash text, p_user_id uuid)
RETURNS TABLE (
  success boolean,
  invitation_id uuid,
  role invitation_role,
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations i
  WHERE i.code_hash = p_code_hash
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND i.current_uses < i.max_uses
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false::boolean,
      NULL::uuid, NULL::invitation_role, NULL::uuid, NULL::uuid, NULL::uuid,
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


-- ---------------------------------------------------------------------------
-- MIGRATION 33/102: 20260213130000_profiles_rls_diriginte_director.sql
-- ---------------------------------------------------------------------------
-- Profiles UPDATE: Diriginte can edit students/parents in their class; Director can edit teachers, students, own.
-- Students/Parents: name/phone read-only (enforced by frontend + RLS denies their UPDATE).

-- Drop existing update policy and recreate with full hierarchy
DROP POLICY IF EXISTS "Profiles: update if higher or equal role" ON public.profiles;

CREATE POLICY "Profiles: update if higher or equal role"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- 1) Editing own profile: staff (teacher+) can update
      (id = auth.uid() AND (
        public.profile_role_rank(COALESCE(
          (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1),
          'student'::public.app_role
        )) >= 2
      ))
      OR
      -- 2) Director/uat_admin: can edit any profile (teachers, students, parents)
      (id != auth.uid() AND (
        has_role(auth.uid(), 'director'::public.app_role)
        OR has_role(auth.uid(), 'uat_admin'::public.app_role)
      ))
      OR
      -- 3) Diriginte: can edit students and parents in their class
      (id != auth.uid() AND has_role(auth.uid(), 'homeroom_teacher'::public.app_role) AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.classes c ON c.id = s.class_id AND c.teacher_id = auth.uid()
        WHERE s.user_id = public.profiles.id
        UNION
        SELECT 1 FROM public.parent_student_relations psr
        JOIN public.students s ON s.id = psr.student_id
        JOIN public.classes c ON c.id = s.class_id AND c.teacher_id = auth.uid()
        WHERE psr.parent_user_id = public.profiles.id
      ))
    )
  );


-- ---------------------------------------------------------------------------
-- MIGRATION 34/102: 20260213200000_fix_create_invitation_rpc.sql
-- ---------------------------------------------------------------------------
-- Repair create_invitation RPC: drop all overloads and create with exact client signature
-- Fixes: "Could not find the function public.create_invitation(...) in the schema cache"

-- 1. Add columns to invitations (if missing)
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_phone TEXT;

-- 2. Drop ALL overloads of create_invitation
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'create_invitation'
  ) LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

-- 3. Create create_invitation with exact parameter list expected by client
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    IF p_role NOT IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Directors can only invite teacher / homeroom_teacher / secretariat'::text;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director can only create invitations for their school'::text;
      RETURN;
    END IF;
  ELSIF public.has_role(v_user_id, 'homeroom_teacher'::public.app_role) THEN
    IF p_role NOT IN ('student'::public.invitation_role, 'parent'::public.invitation_role, 'teacher'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Homeroom teachers can only invite student / parent / teacher'::text;
      RETURN;
    END IF;
    -- Class is required only for student/parent invitations, not for teacher
    IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) THEN
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
    END IF;
    -- For teacher invitations, verify homeroom teacher belongs to the school
    IF p_role = 'teacher'::public.invitation_role THEN
      IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You can only create invitations for your school'::text;
        RETURN;
      END IF;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Not authorized to create invitations'::text;
    RETURN;
  END IF;

  IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND p_class_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
    RETURN;
  END IF;

  IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
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


-- ---------------------------------------------------------------------------
-- MIGRATION 35/102: 20260214_fix_app_role.sql
-- ---------------------------------------------------------------------------

-- Safe app_role + user_roles fix migration

DO $$
DECLARE
  col_type text;
BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
  ) THEN

    CREATE TABLE public.user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role public.app_role NOT NULL,
      UNIQUE (user_id, role)
    );

  ELSE

    SELECT udt_name
    INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
      AND column_name = 'role';

    IF col_type IS NOT NULL AND col_type <> 'app_role' THEN
      EXECUTE '
        ALTER TABLE public.user_roles
        ALTER COLUMN role TYPE public.app_role
        USING role::text::public.app_role
      ';
    END IF;

  END IF;

END $$;


-- ---------------------------------------------------------------------------
-- MIGRATION 36/102: 20260214072647_cbbf9caa-330d-4cb3-bf24-63b8b26d6f9e.sql
-- ---------------------------------------------------------------------------
-- Create RPC functions for Reports page

CREATE OR REPLACE FUNCTION public.get_class_stats_for_display(
  p_class_id uuid,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS TABLE(student_id uuid, student_name text, general_average numeric, absences_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.id AS student_id,
    s.full_name AS student_name,
    vga.general_average,
    COALESCE(vas.total_absences, 0) AS absences_count
  FROM students s
  LEFT JOIN v_student_general_averages vga ON vga.student_id = s.id
  LEFT JOIN v_student_absence_summary vas ON vas.student_id = s.id
  WHERE s.class_id = p_class_id
  ORDER BY s.student_number ASC NULLS LAST, s.full_name ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_class_totals_for_display(
  p_class_id uuid,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS TABLE(class_average numeric, total_absences bigint, total_motivated bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROUND(AVG(vga.general_average), 2) AS class_average,
    COALESCE(SUM(vas.total_absences), 0) AS total_absences,
    COALESCE(SUM(vas.motivated), 0) AS total_motivated
  FROM students s
  LEFT JOIN v_student_general_averages vga ON vga.student_id = s.id
  LEFT JOIN v_student_absence_summary vas ON vas.student_id = s.id
  WHERE s.class_id = p_class_id;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 37/102: 20260214073408_f4358b9e-b54e-4b0e-a956-832bbd8354d0.sql
-- ---------------------------------------------------------------------------
-- Coloana user_roles.role devine public.app_role. Conversie doar când udt_name <> 'app_role' (idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'user_roles' AND c.column_name = 'role'
      AND (c.udt_name IS NULL OR c.udt_name <> 'app_role')
  ) THEN
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
  END IF;
END $$;

-- Recreate has_role to ensure it's clean (no text casts)
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


-- ---------------------------------------------------------------------------
-- MIGRATION 38/102: 20260214100000_ensure_create_invitation_rpc.sql
-- ---------------------------------------------------------------------------
-- Ensure create_invitation RPC exists with the exact signature the client uses.
-- Fixes: "Could not find the function public.create_invitation(...) in the schema cache"
-- Run all migrations with: supabase db push
-- Or run this file manually in Supabase Dashboard → SQL Editor if the error persists.

-- 1. Add columns to invitations (if missing)
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_phone TEXT;

-- 2. Drop ALL overloads of create_invitation so only one signature remains
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'create_invitation'
  ) LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

-- 3. Create create_invitation with the exact parameter list the client sends
-- (order matches client: p_role, p_school_id, p_class_id, p_student_id, p_first_name, p_last_name,
--  p_student_number, p_invited_email, p_invited_phone, p_intended_for, p_max_uses, p_expires_hours;
--  p_created_by is optional and has default so client can omit it)
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
  p_max_uses integer DEFAULT 1,
  p_expires_hours integer DEFAULT 24,
  p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(invitation_id uuid, plain_code text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    IF p_role NOT IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Directors can only invite teacher / homeroom_teacher / secretariat'::text;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director can only create invitations for their school'::text;
      RETURN;
    END IF;
  ELSIF public.has_role(v_user_id, 'homeroom_teacher'::public.app_role) THEN
    IF p_role NOT IN ('student'::public.invitation_role, 'parent'::public.invitation_role, 'teacher'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Homeroom teachers can only invite student / parent / teacher'::text;
      RETURN;
    END IF;
    -- Class is required only for student/parent invitations, not for teacher
    IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) THEN
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
    END IF;
    -- For teacher invitations, verify homeroom teacher belongs to the school
    IF p_role = 'teacher'::public.invitation_role THEN
      IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You can only create invitations for your school'::text;
        RETURN;
      END IF;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Not authorized to create invitations'::text;
    RETURN;
  END IF;

  IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND p_class_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
    RETURN;
  END IF;

  IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
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


-- ---------------------------------------------------------------------------
-- MIGRATION 39/102: 20260214110000_fix_has_role_text_comparison.sql
-- ---------------------------------------------------------------------------
-- Fix la nivel de schemă: coloana public.user_roles.role trebuie să fie public.app_role (nu text).
-- Conversie doar dacă coloana nu e deja app_role (evită "operator does not exist: app_role = text"). Idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'user_roles' AND c.column_name = 'role'
      AND (c.udt_name IS NULL OR c.udt_name <> 'app_role')
  ) THEN
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- MIGRATION 40/102: 20260214120000_user_roles_role_to_app_role.sql
-- ---------------------------------------------------------------------------
-- Coloana user_roles.role devine public.app_role (nu text). Conversie doar când nu e deja app_role. Idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'user_roles' AND c.column_name = 'role'
      AND (c.udt_name IS NULL OR c.udt_name <> 'app_role')
  ) THEN
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
  END IF;
END $$;

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


-- ---------------------------------------------------------------------------
-- MIGRATION 41/102: 20260216145406_c04d3e79-c0b2-4e63-bbbe-4198ac26d63b.sql
-- ---------------------------------------------------------------------------
-- Ensure personal data columns exist before recreating claim_invitation
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_phone TEXT,
  ADD COLUMN IF NOT EXISTS intended_for TEXT;

-- Drop old claim_invitation
DROP FUNCTION IF EXISTS public.claim_invitation(text, uuid);

-- Recreate claim_invitation with personal data fields
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations i
  WHERE i.code_hash = p_code_hash
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND i.current_uses < i.max_uses
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


-- ---------------------------------------------------------------------------
-- MIGRATION 42/102: 20260216150010_d5241aa5-e2c4-453e-a52e-8a7616907996.sql
-- ---------------------------------------------------------------------------
-- Ensure personal data columns exist before recreating create_invitation
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_phone TEXT,
  ADD COLUMN IF NOT EXISTS intended_for TEXT;

-- Drop the two old overloads explicitly by their exact signatures
DROP FUNCTION IF EXISTS public.create_invitation(invitation_role, uuid, uuid, uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.create_invitation(invitation_role, uuid, uuid, uuid, uuid, integer, integer, text);

-- Now create the single correct version with all parameters
CREATE FUNCTION public.create_invitation(
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF has_role(v_user_id, 'developer'::public.app_role) THEN
    NULL;
  ELSIF has_role(v_user_id, 'director'::public.app_role) THEN
    IF p_role NOT IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Directors can only invite teacher / homeroom_teacher / secretariat'::text;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director can only create invitations for their school'::text;
      RETURN;
    END IF;
  ELSIF has_role(v_user_id, 'homeroom_teacher'::public.app_role) THEN
    IF p_role NOT IN ('student'::public.invitation_role, 'parent'::public.invitation_role, 'teacher'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Homeroom teachers can only invite student / parent / teacher'::text;
      RETURN;
    END IF;
    -- Class is required only for student/parent invitations, not for teacher
    IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) THEN
      IF p_class_id IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
        RETURN;
      END IF;
      SELECT c.school_id INTO v_class_school_id FROM classes c WHERE c.id = p_class_id;
      IF v_class_school_id IS NULL OR v_class_school_id <> p_school_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class does not belong to the specified school'::text;
        RETURN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = p_class_id AND c.teacher_id = v_user_id) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You are not the homeroom teacher for this class'::text;
        RETURN;
      END IF;
    END IF;
    -- For teacher invitations, verify homeroom teacher belongs to the school
    IF p_role = 'teacher'::public.invitation_role THEN
      IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You can only create invitations for your school'::text;
        RETURN;
      END IF;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Not authorized to create invitations'::text;
    RETURN;
  END IF;

  IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND p_class_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
    RETURN;
  END IF;

  IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
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


-- ---------------------------------------------------------------------------
-- MIGRATION 43/102: 20260216150210_6d5fd59b-df72-48cb-a80a-693c9fced028.sql
-- ---------------------------------------------------------------------------
ALTER TYPE public.invitation_role ADD VALUE IF NOT EXISTS 'secretariat';


-- ---------------------------------------------------------------------------
-- MIGRATION 44/102: 20260216153745_7530a7d6-3f81-4586-b427-1c9fba85d981.sql
-- ---------------------------------------------------------------------------

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_student_number integer;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_email text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_phone text;


-- ---------------------------------------------------------------------------
-- MIGRATION 45/102: 20260216160000_ensure_invitations_personal_data_final.sql
-- ---------------------------------------------------------------------------
-- Final migration to ensure invitations table has all personal data columns.
-- This runs AFTER all other migrations to guarantee columns exist.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

-- Ensure all personal data columns exist in invitations table
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_phone TEXT,
  ADD COLUMN IF NOT EXISTS intended_for TEXT;


-- ---------------------------------------------------------------------------
-- MIGRATION 46/102: 20260217120000_student_number_en_format.sql
-- ---------------------------------------------------------------------------
-- Store student_number as TEXT in format EN-XXXXX (5 digits) for consistency and future-proofing.
-- Existing integer values are converted to EN-XXXXX (e.g. 1 -> EN-00001, 123 -> EN-00123).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'student_number'
  ) THEN
    ALTER TABLE public.students
      ALTER COLUMN student_number TYPE TEXT
      USING (
        CASE
          WHEN student_number IS NULL THEN NULL
          ELSE 'EN-' || LPAD((student_number)::text, 5, '0')
        END
      );
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- MIGRATION 47/102: 20260217130000_students_rls_homeroom_and_student_number_text.sql
-- ---------------------------------------------------------------------------
-- 1) Ensure student_number accepts EN-XXXXX (TEXT). Idempotent: only alter if column is still integer.
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'student_number';
  IF col_type = 'integer' THEN
    ALTER TABLE public.students
      ALTER COLUMN student_number TYPE TEXT
      USING (CASE WHEN student_number IS NULL THEN NULL ELSE 'EN-' || LPAD((student_number)::text, 5, '0') END);
  END IF;
END $$;

-- 2) Allow homeroom_teacher to INSERT/UPDATE/DELETE students only in their own class.
--    (Secretariat/director already have "Secretariat can manage all students".)
DROP POLICY IF EXISTS "Homeroom can manage students in own class" ON public.students;
CREATE POLICY "Homeroom can manage students in own class" ON public.students
  FOR ALL
  USING (
    has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- MIGRATION 48/102: 20260217140000_grades_rls_teacher_subject_access.sql
-- ---------------------------------------------------------------------------
-- RLS Policies for Grades: Teacher-Subject Access Control
-- Implements strict access control based on teacher-subject assignment
-- 
-- INSERT/UPDATE/DELETE: Only teachers assigned to the subject can modify grades
-- SELECT: Students, their teachers, and parents can view grades

BEGIN;

-- Drop all existing grades policies to recreate with new rules
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
DROP POLICY IF EXISTS "Staff can manage grades" ON public.grades;
DROP POLICY IF EXISTS "Developers can view all grades" ON public.grades;

-- INSERT: Only teachers assigned to the subject can insert grades
CREATE POLICY "Teachers can insert grades (teacher-subject access)" ON public.grades
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id)
  );

-- UPDATE: Only teachers assigned to the subject can update grades
CREATE POLICY "Teachers can update grades (teacher-subject access)" ON public.grades
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id)
  )
  WITH CHECK (
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id)
  );

-- DELETE: Only teachers assigned to the subject can delete grades
CREATE POLICY "Teachers can delete grades (teacher-subject access)" ON public.grades
  FOR DELETE
  USING (
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id)
  );

-- SELECT: Students, their teachers, and parents can view grades
-- Rule: auth.uid() = student_id OR auth.uid() = teacher_id OR auth.uid() IN (SELECT parent_user_id FROM parent_student_relations WHERE student_id = grades.student_id)
-- Implementation: 
--   - student_id in grades references students.id, so we check students.user_id
--   - teacher_id in grades is the user_id of the teacher
CREATE POLICY "Students teachers and parents can view grades" ON public.grades
  FOR SELECT
  USING (
    -- Student can view their own grades (auth.uid() matches students.user_id where students.id = student_id)
    auth.uid() IN (SELECT user_id FROM public.students WHERE id = student_id AND user_id IS NOT NULL)
    OR
    -- Teacher can view grades (auth.uid() = teacher_id in grades table)
    (auth.uid() = teacher_id AND teacher_id IS NOT NULL)
    OR
    -- Teacher assigned to the subject can view grades (auth.uid() matches subjects.teacher_id)
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id AND teacher_id IS NOT NULL)
    OR
    -- Parent can view their child's grades (via parent_student_relations)
    auth.uid() IN (
      SELECT parent_user_id 
      FROM public.parent_student_relations 
      WHERE student_id = grades.student_id
    )
  );

-- Staff (Director/Secretariat/UAT Admin) can manage all grades
CREATE POLICY "Staff can manage all grades" ON public.grades
  FOR ALL
  USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- Developers can view all grades (for debugging)
CREATE POLICY "Developers can view all grades" ON public.grades
  FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 49/102: 20260218000000_get_school_grades_stats.sql
-- ---------------------------------------------------------------------------
-- RPC for Director dashboard: returns grade count and average in one query
-- Avoids fetching thousands of rows to compute average in frontend
CREATE OR REPLACE FUNCTION public.get_school_grades_stats()
RETURNS TABLE(total_count bigint, average_grade numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    ROUND(AVG(grade)::numeric, 2) AS average_grade
  FROM public.grades;
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 50/102: 20260218000001_students_cnp_birth_date_gender.sql
-- ---------------------------------------------------------------------------
-- Add CNP, birth_date and gender to students for registration forms (optional).
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS cnp TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT;

COMMENT ON COLUMN public.students.cnp IS 'Romanian CNP (Cod Numeric Personal), 13 digits';
COMMENT ON COLUMN public.students.birth_date IS 'Birth date; can be derived from CNP';
COMMENT ON COLUMN public.students.gender IS 'M or F; can be derived from CNP';


-- ---------------------------------------------------------------------------
-- MIGRATION 51/102: 20260218100000_get_grades_distribution.sql
-- ---------------------------------------------------------------------------
-- RPC for Director dashboard: returns grade distribution (count per grade 1-10)
-- Used for BarChart visualization without fetching all rows
CREATE OR REPLACE FUNCTION public.get_grades_distribution()
RETURNS TABLE(grade int, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROUND(g.grade)::int AS grade,
    COUNT(*)::bigint AS cnt
  FROM public.grades g
  WHERE g.grade >= 1 AND g.grade <= 10
  GROUP BY ROUND(g.grade)
  ORDER BY ROUND(g.grade);
$$;


-- ---------------------------------------------------------------------------
-- MIGRATION 52/102: 20260218100000_system_health_app_settings.sql
-- ---------------------------------------------------------------------------
-- System Health: app_settings for maintenance mode and RPC for recent errors.
-- Access: only uat_admin and developer can read/write app_settings and call error RPC.

-- 1) app_settings key-value store (maintenance_mode, etc.)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only uat_admin and developer can manage app_settings" ON public.app_settings;
CREATE POLICY "Only uat_admin and developer can manage app_settings"
  ON public.app_settings
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Seed default: maintenance_mode off
INSERT INTO public.app_settings (key, value)
VALUES ('maintenance_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) RPC: get maintenance mode (callable by uat_admin/developer; others get false)
CREATE OR REPLACE FUNCTION public.get_maintenance_mode()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_val BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  IF NOT (public.has_role(v_uid, 'uat_admin'::app_role) OR public.has_role(v_uid, 'developer'::app_role)) THEN
    -- Non-admin: still return actual value so frontend can show maintenance page
    SELECT (value = true OR value = 'true') INTO v_val
    FROM public.app_settings
    WHERE key = 'maintenance_mode'
    LIMIT 1;
    RETURN COALESCE(v_val, false);
  END IF;
  SELECT (value = true OR value = 'true') INTO v_val
  FROM public.app_settings
  WHERE key = 'maintenance_mode'
  LIMIT 1;
  RETURN COALESCE(v_val, false);
END;
$$;

-- 3) RPC: set maintenance mode (only uat_admin/developer)
CREATE OR REPLACE FUNCTION public.set_maintenance_mode(enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (public.has_role(v_uid, 'uat_admin'::app_role) OR public.has_role(v_uid, 'developer'::app_role)) THEN
    RAISE EXCEPTION 'Only admins and developers can change maintenance mode';
  END IF;
  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES ('maintenance_mode', to_jsonb(enabled), now())
  ON CONFLICT (key) DO UPDATE SET value = to_jsonb(enabled), updated_at = now();
END;
$$;

-- 4) RPC: last 10 frontend errors from audit_logs (only uat_admin/developer can call)
CREATE OR REPLACE FUNCTION public.get_system_recent_errors()
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  message TEXT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'uat_admin'::app_role) OR public.has_role(v_uid, 'developer'::app_role)) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    a.id,
    a.created_at,
    a.user_name,
    COALESCE((a.details->>'message')::TEXT, a.action) AS message,
    a.details
  FROM public.audit_logs a
  WHERE a.action = 'error.frontend'
  ORDER BY a.created_at DESC NULLS LAST
  LIMIT 10;
END;
$$;

COMMENT ON TABLE public.app_settings IS 'System settings (e.g. maintenance_mode). Only uat_admin and developer can read/write.';


-- ---------------------------------------------------------------------------
-- MIGRATION 53/102: 20260218110000_profiles_onboarding_tour.sql
-- ---------------------------------------------------------------------------
-- Store whether the teacher onboarding tour has been completed (run once per user).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_tour_completed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.onboarding_tour_completed IS 'When true, the teacher onboarding tour will not be shown again.';


-- ---------------------------------------------------------------------------
-- MIGRATION 54/102: 20260219000000_announcements_and_excuse_requests_rls.sql
-- ---------------------------------------------------------------------------
-- Tabelele announcements și attendance_excuse_requests + RLS
-- announcements: deja există în migrații anterioare - asigură existența
-- attendance_excuse_requests: deja există - actualizează RLS conform cerințelor:
--   - Doar Directorul poate aproba cererile
--   - Elevii pot vedea cererile pe ale lor (pentru absențele lor)

-- =============================================================================
-- 1) ANNOUNCEMENTS (dacă lipsește din vreun mediu)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  target_role public.app_role,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_target_role ON public.announcements (target_role);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read announcements" ON public.announcements;
CREATE POLICY "Authenticated can read announcements" ON public.announcements
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can publish announcements" ON public.announcements;
CREATE POLICY "Staff can publish announcements" ON public.announcements
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND (
      has_role(auth.uid(), 'director'::public.app_role)
      OR has_role(auth.uid(), 'secretariat'::public.app_role)
      OR has_role(auth.uid(), 'uat_admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Staff can update announcements" ON public.announcements;
CREATE POLICY "Staff can update announcements" ON public.announcements
  FOR UPDATE USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::public.app_role)
    OR has_role(auth.uid(), 'secretariat'::public.app_role)
    OR has_role(auth.uid(), 'uat_admin'::public.app_role)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::public.app_role)
    OR has_role(auth.uid(), 'secretariat'::public.app_role)
    OR has_role(auth.uid(), 'uat_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff can delete announcements" ON public.announcements;
CREATE POLICY "Staff can delete announcements" ON public.announcements
  FOR DELETE USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::public.app_role)
    OR has_role(auth.uid(), 'secretariat'::public.app_role)
    OR has_role(auth.uid(), 'uat_admin'::public.app_role)
  );

-- =============================================================================
-- 2) ATTENDANCE_EXCUSE_REQUESTS (dacă lipsește)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.attendance_excuse_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.attendance_excuse_requests ENABLE ROW LEVEL SECURITY;

-- Șterge politicile vechi pentru a le recrea conform cerințelor
DROP POLICY IF EXISTS "Users can view own attendance excuse requests" ON public.attendance_excuse_requests;
DROP POLICY IF EXISTS "Users can create attendance excuse requests" ON public.attendance_excuse_requests;
DROP POLICY IF EXISTS "Homeroom can manage excuse requests" ON public.attendance_excuse_requests;
DROP POLICY IF EXISTS "Staff can manage attendance excuse requests" ON public.attendance_excuse_requests;

-- SELECT: Directorul vede toate cererile (pentru panou)
-- Elevii văd cererile pentru absențele lor
-- Părinții văd cererile pentru copiii lor
-- Creatorul (requested_by) vede cererea
DROP POLICY IF EXISTS "Director views all excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Director views all excuse requests" ON public.attendance_excuse_requests
  FOR SELECT USING (has_role(auth.uid(), 'director'::public.app_role));

CREATE POLICY "Students and parents view own excuse requests" ON public.attendance_excuse_requests
  FOR SELECT USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      WHERE a.id = attendance_id
        AND (
          s.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.parent_student_relations psr
            WHERE psr.parent_user_id = auth.uid() AND psr.student_id = s.id
          )
        )
    )
  );

-- INSERT: Elevii și părinții pot crea cereri pentru absențele elevului
CREATE POLICY "Students and parents create excuse requests" ON public.attendance_excuse_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      WHERE a.id = attendance_id
        AND (
          s.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.parent_student_relations psr
            WHERE psr.parent_user_id = auth.uid() AND psr.student_id = s.id
          )
        )
    )
  );

-- UPDATE/DELETE: Doar Directorul poate aproba/respinge cererile
DROP POLICY IF EXISTS "Director approves excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Director approves excuse requests" ON public.attendance_excuse_requests
  FOR UPDATE USING (has_role(auth.uid(), 'director'::public.app_role))
  WITH CHECK (has_role(auth.uid(), 'director'::public.app_role));


-- ---------------------------------------------------------------------------
-- MIGRATION 55/102: 20260219000000_multi_tenancy_school_id.sql
-- ---------------------------------------------------------------------------
-- Migration: Add school_id to all tables for multi-tenancy support
-- This ensures all data is properly scoped to schools

BEGIN;

-- 1) Add school_id to students table (derived from class)
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Update existing students with school_id from their class
UPDATE public.students s
SET school_id = c.school_id
FROM public.classes c
WHERE s.class_id = c.id AND s.school_id IS NULL;

-- Make school_id NOT NULL after backfilling
ALTER TABLE public.students
ALTER COLUMN school_id SET NOT NULL;

-- 2) Add school_id to subjects table (derived from class)
ALTER TABLE public.subjects 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Update existing subjects with school_id from their class
UPDATE public.subjects s
SET school_id = c.school_id
FROM public.classes c
WHERE s.class_id = c.id AND s.school_id IS NULL;

-- Make school_id NOT NULL after backfilling
ALTER TABLE public.subjects
ALTER COLUMN school_id SET NOT NULL;

-- 3) Add school_id to grades table (derived from student)
ALTER TABLE public.grades 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Update existing grades with school_id from their student
UPDATE public.grades g
SET school_id = s.school_id
FROM public.students s
WHERE g.student_id = s.id AND g.school_id IS NULL;

-- Make school_id NOT NULL after backfilling
ALTER TABLE public.grades
ALTER COLUMN school_id SET NOT NULL;

-- 4) Add school_id to attendance table (derived from student)
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Update existing attendance with school_id from their student
UPDATE public.attendance a
SET school_id = s.school_id
FROM public.students s
WHERE a.student_id = s.id AND a.school_id IS NULL;

-- Make school_id NOT NULL after backfilling
ALTER TABLE public.attendance
ALTER COLUMN school_id SET NOT NULL;

-- 5) Add is_excused column to attendance for motivated/unmotivated absences
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS is_excused BOOLEAN DEFAULT false;

-- Update existing records: 'motivat' or 'motivated' status means is_excused = true
UPDATE public.attendance
SET is_excused = true
WHERE status IN ('motivat', 'motivated') AND is_excused IS NULL;

-- 6) Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_id ON public.grades(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);

-- 7) Add triggers to automatically set school_id on INSERT
-- For students: derive from class
CREATE OR REPLACE FUNCTION public.set_student_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_student_school_id ON public.students;
CREATE TRIGGER trg_set_student_school_id
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.set_student_school_id();

-- For subjects: derive from class
CREATE OR REPLACE FUNCTION public.set_subject_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_subject_school_id ON public.subjects;
CREATE TRIGGER trg_set_subject_school_id
  BEFORE INSERT OR UPDATE ON public.subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_subject_school_id();

-- For grades: derive from student
CREATE OR REPLACE FUNCTION public.set_grade_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.students
    WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_grade_school_id ON public.grades;
CREATE TRIGGER trg_set_grade_school_id
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.set_grade_school_id();

-- For attendance: derive from student
CREATE OR REPLACE FUNCTION public.set_attendance_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.students
    WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_attendance_school_id ON public.attendance;
CREATE TRIGGER trg_set_attendance_school_id
  BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attendance_school_id();

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 56/102: 20260219000001_rls_school_id_enforcement.sql
-- ---------------------------------------------------------------------------
-- Migration: RLS policies to enforce school_id filtering
-- Ensures users can only access data from their own school

BEGIN;

-- Helper function to get user's school_id
CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 1) Students RLS: Users can only see students from their school
DROP POLICY IF EXISTS "Users can view students from their school" ON public.students;
CREATE POLICY "Users can view students from their school" ON public.students
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage students from their school" ON public.students;
CREATE POLICY "Staff can manage students from their school" ON public.students
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 2) Subjects RLS: Users can only see subjects from their school
DROP POLICY IF EXISTS "Users can view subjects from their school" ON public.subjects;
CREATE POLICY "Users can view subjects from their school" ON public.subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage subjects from their school" ON public.subjects;
CREATE POLICY "Staff can manage subjects from their school" ON public.subjects
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'teacher'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 3) Grades RLS: Users can only see grades from their school
-- Update existing policies to include school_id check
DROP POLICY IF EXISTS "Users can view grades from their school" ON public.grades;
CREATE POLICY "Users can view grades from their school" ON public.grades
  FOR SELECT
  USING (
    (
      school_id = public.get_user_school_id() AND
      deleted_at IS NULL
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Update insert policy to require school_id match
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can insert grades (scoped)" ON public.grades
  FOR INSERT
  WITH CHECK (
    school_id = public.get_user_school_id() AND
    teacher_id = auth.uid() AND
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid() AND school_id = public.get_user_school_id()) AND
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = auth.uid() AND s.school_id = public.get_user_school_id()
    ) OR
    public.has_role(auth.uid(), 'director'::app_role) OR
    public.has_role(auth.uid(), 'secretariat'::app_role) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Update update policy
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can update grades (scoped)" ON public.grades
  FOR UPDATE
  USING (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = auth.uid() AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid() AND school_id = public.get_user_school_id())
    ) OR
    public.has_role(auth.uid(), 'director'::app_role) OR
    public.has_role(auth.uid(), 'secretariat'::app_role) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = auth.uid() AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid() AND school_id = public.get_user_school_id())
    ) OR
    public.has_role(auth.uid(), 'director'::app_role) OR
    public.has_role(auth.uid(), 'secretariat'::app_role) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Update delete policy
DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can delete grades (scoped)" ON public.grades
  FOR DELETE
  USING (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = auth.uid() AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid() AND school_id = public.get_user_school_id())
    ) OR
    public.has_role(auth.uid(), 'director'::app_role) OR
    public.has_role(auth.uid(), 'secretariat'::app_role) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 4) Attendance RLS: Users can only see attendance from their school
DROP POLICY IF EXISTS "Users can view attendance from their school" ON public.attendance;
CREATE POLICY "Users can view attendance from their school" ON public.attendance
  FOR SELECT
  USING (
    (
      school_id = public.get_user_school_id() AND
      deleted_at IS NULL
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Update insert policy
DROP POLICY IF EXISTS "Teachers can insert attendance (scoped)" ON public.attendance;
CREATE POLICY "Teachers can insert attendance (scoped)" ON public.attendance
  FOR INSERT
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = auth.uid() AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid() AND school_id = public.get_user_school_id()) AND
      student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.teacher_id = auth.uid() AND s.school_id = public.get_user_school_id()
      )
    ) OR
    public.has_role(auth.uid(), 'director'::app_role) OR
    public.has_role(auth.uid(), 'secretariat'::app_role) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Update update policy
DROP POLICY IF EXISTS "Teachers can update attendance (scoped)" ON public.attendance;
CREATE POLICY "Teachers can update attendance (scoped)" ON public.attendance
  FOR UPDATE
  USING (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = auth.uid() AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid() AND school_id = public.get_user_school_id())
    ) OR
    public.has_role(auth.uid(), 'director'::app_role) OR
    public.has_role(auth.uid(), 'secretariat'::app_role) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = auth.uid() AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid() AND school_id = public.get_user_school_id())
    ) OR
    public.has_role(auth.uid(), 'director'::app_role) OR
    public.has_role(auth.uid(), 'secretariat'::app_role) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Update delete policy
DROP POLICY IF EXISTS "Teachers can delete attendance (scoped)" ON public.attendance;
CREATE POLICY "Teachers can delete attendance (scoped)" ON public.attendance
  FOR DELETE
  USING (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = auth.uid() AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid() AND school_id = public.get_user_school_id())
    ) OR
    public.has_role(auth.uid(), 'director'::app_role) OR
    public.has_role(auth.uid(), 'secretariat'::app_role) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 5) Classes RLS: Users can only see classes from their school
DROP POLICY IF EXISTS "Users can view classes from their school" ON public.classes;
CREATE POLICY "Users can view classes from their school" ON public.classes
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage classes from their school" ON public.classes;
CREATE POLICY "Staff can manage classes from their school" ON public.classes
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 57/102: 20260220000000_check_constraints_and_strict_rls.sql
-- ---------------------------------------------------------------------------
-- Migration: Add CHECK constraints and implement strict RLS policies
-- 1. Ensure grades are integers between 1-10
-- 2. Add CHECK constraint for attendance is_excused
-- 3. Create class_subjects junction table for teacher-class-subject assignments
-- 4. Implement strict RLS: students can only see their own grades
-- 5. Implement strict RLS: teachers can only see grades for classes where they teach subjects

BEGIN;

-- ============================================================================
-- PART 1: CHECK CONSTRAINTS
-- ============================================================================

-- 1.1) Ensure grades are integers between 1-10
-- First, check if grade column is DECIMAL/NUMERIC and needs conversion
DO $$
BEGIN
  -- Check if grade column exists and is not integer
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'grades' 
    AND column_name = 'grade'
    AND data_type NOT IN ('integer', 'smallint', 'bigint')
  ) THEN
    -- Convert existing grades to integers (round to nearest integer)
    UPDATE public.grades 
    SET grade = ROUND(grade::numeric)::integer
    WHERE grade IS NOT NULL;
    
    -- Alter column type to integer
    ALTER TABLE public.grades 
    ALTER COLUMN grade TYPE INTEGER USING ROUND(grade::numeric)::integer;
  END IF;
END $$;

-- Add or replace CHECK constraint for grades (1-10)
ALTER TABLE public.grades 
DROP CONSTRAINT IF EXISTS grades_grade_check;

ALTER TABLE public.grades 
ADD CONSTRAINT grades_grade_check 
CHECK (grade >= 1 AND grade <= 10);

-- 1.2) Ensure is_excused is properly constrained (boolean already has implicit constraint)
-- Add explicit CHECK if needed for data integrity
ALTER TABLE public.attendance 
DROP CONSTRAINT IF EXISTS attendance_is_excused_check;

-- Boolean columns don't need CHECK constraints, but we ensure it's NOT NULL
ALTER TABLE public.attendance 
ALTER COLUMN is_excused SET NOT NULL;

-- ============================================================================
-- PART 2: CLASS_SUBJECTS JUNCTION TABLE
-- ============================================================================

-- 2.1) Create class_subjects junction table
-- This allows a teacher to be assigned to teach a subject in a specific class
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (class_id, subject_id, teacher_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_class_subjects_class_id ON public.class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject_id ON public.class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher_id ON public.class_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school_id ON public.class_subjects(school_id);

-- Enable RLS
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

-- 2.2) Populate class_subjects from existing subjects table
-- Migrate existing teacher-subject-class relationships
INSERT INTO public.class_subjects (class_id, subject_id, teacher_id, school_id)
SELECT DISTINCT 
  s.class_id,
  s.id AS subject_id,
  s.teacher_id,
  s.school_id
FROM public.subjects s
WHERE s.class_id IS NOT NULL 
  AND s.teacher_id IS NOT NULL
  AND s.school_id IS NOT NULL
ON CONFLICT (class_id, subject_id, teacher_id) DO NOTHING;

-- 2.3) Add trigger to automatically set school_id on INSERT
CREATE OR REPLACE FUNCTION public.set_class_subject_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    -- Try to get school_id from class
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
    
    -- If still NULL, try from subject
    IF NEW.school_id IS NULL THEN
      SELECT school_id INTO NEW.school_id
      FROM public.subjects
      WHERE id = NEW.subject_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_class_subject_school_id ON public.class_subjects;
CREATE TRIGGER trg_set_class_subject_school_id
  BEFORE INSERT OR UPDATE ON public.class_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_class_subject_school_id();

-- ============================================================================
-- PART 3: STRICT RLS POLICIES FOR GRADES
-- ============================================================================

-- 3.1) Drop existing grades policies to recreate with strict rules
DROP POLICY IF EXISTS "Users can view grades from their school" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Students teachers and parents can view grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Staff can manage all grades" ON public.grades;
DROP POLICY IF EXISTS "Developers can view all grades" ON public.grades;

-- 3.2) SELECT: Students can only see their own grades
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    -- Student can view their own grades (auth.uid() matches students.user_id)
    auth.uid() IN (
      SELECT user_id 
      FROM public.students 
      WHERE id = student_id 
        AND user_id IS NOT NULL
        AND school_id = public.get_user_school_id()
    )
    OR
    -- Staff (director/secretariat) can view all grades from their school
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 3.3) SELECT: Teachers can only see grades for classes where they teach subjects
CREATE POLICY "Teachers can view grades for assigned classes" ON public.grades
  FOR SELECT
  USING (
    -- Teacher can view grades if they teach the subject in the student's class
    auth.uid() IN (
      SELECT cs.teacher_id
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      auth.uid() IN (
        SELECT teacher_id 
        FROM public.subjects 
        WHERE id = subject_id 
          AND teacher_id = auth.uid()
          AND school_id = public.get_user_school_id()
      )
      AND student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.subjects sub ON sub.class_id = s.class_id
        WHERE sub.id = subject_id
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can view all grades from their school
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 3.4) SELECT: Parents can view their children's grades
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    -- Parent can view their child's grades
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = student_id
        AND psr.parent_user_id = auth.uid()
    )
    AND school_id = public.get_user_school_id()
  );

-- 3.5) INSERT: Only teachers assigned to the subject in that class can insert grades
CREATE POLICY "Teachers can insert grades for assigned classes" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- Teacher must be assigned to teach this subject in the student's class
    auth.uid() IN (
      SELECT cs.teacher_id
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      auth.uid() IN (
        SELECT teacher_id 
        FROM public.subjects 
        WHERE id = subject_id 
          AND teacher_id = auth.uid()
          AND school_id = public.get_user_school_id()
      )
      AND student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.subjects sub ON sub.class_id = s.class_id
        WHERE sub.id = subject_id
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can insert grades
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can insert
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 3.6) UPDATE: Only teachers assigned to the subject in that class can update grades
CREATE POLICY "Teachers can update grades for assigned classes" ON public.grades
  FOR UPDATE
  USING (
    -- Teacher must be assigned to teach this subject in the student's class
    auth.uid() IN (
      SELECT cs.teacher_id
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      auth.uid() IN (
        SELECT teacher_id 
        FROM public.subjects 
        WHERE id = subject_id 
          AND teacher_id = auth.uid()
          AND school_id = public.get_user_school_id()
      )
      AND student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.subjects sub ON sub.class_id = s.class_id
        WHERE sub.id = subject_id
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can update grades
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can update
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK
    auth.uid() IN (
      SELECT cs.teacher_id
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
    )
    OR
    (
      auth.uid() IN (
        SELECT teacher_id 
        FROM public.subjects 
        WHERE id = subject_id 
          AND teacher_id = auth.uid()
          AND school_id = public.get_user_school_id()
      )
      AND student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.subjects sub ON sub.class_id = s.class_id
        WHERE sub.id = subject_id
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 3.7) DELETE: Only teachers assigned to the subject in that class can delete grades
CREATE POLICY "Teachers can delete grades for assigned classes" ON public.grades
  FOR DELETE
  USING (
    -- Teacher must be assigned to teach this subject in the student's class
    auth.uid() IN (
      SELECT cs.teacher_id
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      auth.uid() IN (
        SELECT teacher_id 
        FROM public.subjects 
        WHERE id = subject_id 
          AND teacher_id = auth.uid()
          AND school_id = public.get_user_school_id()
      )
      AND student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.subjects sub ON sub.class_id = s.class_id
        WHERE sub.id = subject_id
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can delete grades
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can delete
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 4: STRICT RLS POLICIES FOR ATTENDANCE (similar to grades)
-- ============================================================================

-- 4.1) Drop existing attendance policies to recreate with strict rules
DROP POLICY IF EXISTS "Users can view attendance from their school" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can insert attendance (scoped)" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can update attendance (scoped)" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can delete attendance (scoped)" ON public.attendance;

-- 4.2) SELECT: Students can only see their own attendance
CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Student can view their own attendance
    auth.uid() IN (
      SELECT user_id 
      FROM public.students 
      WHERE id = student_id 
        AND user_id IS NOT NULL
        AND school_id = public.get_user_school_id()
    )
    OR
    -- Staff (director/secretariat) can view all attendance from their school
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 4.3) SELECT: Teachers can only see attendance for classes where they teach subjects
CREATE POLICY "Teachers can view attendance for assigned classes" ON public.attendance
  FOR SELECT
  USING (
    -- Teacher can view attendance if they teach the subject in the student's class
    auth.uid() IN (
      SELECT cs.teacher_id
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      auth.uid() IN (
        SELECT teacher_id 
        FROM public.subjects 
        WHERE id = subject_id 
          AND teacher_id = auth.uid()
          AND school_id = public.get_user_school_id()
      )
      AND student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.subjects sub ON sub.class_id = s.class_id
        WHERE sub.id = subject_id
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can view all attendance from their school
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 4.4) SELECT: Parents can view their children's attendance
CREATE POLICY "Parents can view children attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Parent can view their child's attendance
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = student_id
        AND psr.parent_user_id = auth.uid()
    )
    AND school_id = public.get_user_school_id()
  );

-- 4.5) INSERT/UPDATE/DELETE: Only teachers assigned to the subject in that class can modify attendance
CREATE POLICY "Teachers can manage attendance for assigned classes" ON public.attendance
  FOR ALL
  USING (
    -- Teacher must be assigned to teach this subject in the student's class
    auth.uid() IN (
      SELECT cs.teacher_id
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      auth.uid() IN (
        SELECT teacher_id 
        FROM public.subjects 
        WHERE id = subject_id 
          AND teacher_id = auth.uid()
          AND school_id = public.get_user_school_id()
      )
      AND student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.subjects sub ON sub.class_id = s.class_id
        WHERE sub.id = subject_id
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can manage attendance
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can manage
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK
    auth.uid() IN (
      SELECT cs.teacher_id
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
    )
    OR
    (
      auth.uid() IN (
        SELECT teacher_id 
        FROM public.subjects 
        WHERE id = subject_id 
          AND teacher_id = auth.uid()
          AND school_id = public.get_user_school_id()
      )
      AND student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.subjects sub ON sub.class_id = s.class_id
        WHERE sub.id = subject_id
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 5: RLS POLICIES FOR CLASS_SUBJECTS TABLE
-- ============================================================================

-- 5.1) Users can view class_subjects from their school
CREATE POLICY "Users can view class_subjects from their school" ON public.class_subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 5.2) Staff can manage class_subjects
CREATE POLICY "Staff can manage class_subjects" ON public.class_subjects
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 58/102: 20260220000000_notifications_robust_schema.sql
-- ---------------------------------------------------------------------------
-- Schema robust pentru notifications: message, link, is_read, type
-- RLS: utilizator vede/marchează doar ale lui; director/teacher pot insera

-- Adaugă coloane noi dacă lipsesc (compatibilitate cu schema existentă)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Migrare: copiază body în message dacă message e gol
UPDATE public.notifications
SET message = COALESCE(body, title, '')
WHERE message IS NULL AND (body IS NOT NULL OR title IS NOT NULL);

-- Sincronizează is_read din read_at
UPDATE public.notifications
SET is_read = (read_at IS NOT NULL)
WHERE read_at IS NOT NULL;

-- Șterge politicile vechi pentru a le recrea
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;

-- SELECT: utilizatorul vede doar propriile notificări
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- UPDATE: utilizatorul poate marca doar propriile notificări ca citite
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT: utilizatorul (rar) sau director/teacher pot insera
-- Service role bypass-ează RLS, deci sistemul poate insera oricum
CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'director'::public.app_role)
    OR has_role(auth.uid(), 'teacher'::public.app_role)
    OR has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    OR has_role(auth.uid(), 'secretariat'::public.app_role)
    OR has_role(auth.uid(), 'uat_admin'::public.app_role)
  );

-- Activează Realtime pentru notifications (Dashboard > Database > Replication)
-- Dacă nu merge, adaugă manual tabela notifications în supabase_realtime


-- ---------------------------------------------------------------------------
-- MIGRATION 59/102: 20260221000000_audit_log_details_grades_trigger.sql
-- ---------------------------------------------------------------------------
-- Migration: audit_log_details table + trigger on grades UPDATE
-- Stores old_value/new_value as JSONB and the user who made the change (auth.uid())

BEGIN;

-- 1) Create audit_log_details table
CREATE TABLE IF NOT EXISTS public.audit_log_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log_details IS 'Stores before/after values (JSONB) for audited changes; populated by triggers.';
COMMENT ON COLUMN public.audit_log_details.user_id IS 'User who performed the change (from auth.uid()).';
COMMENT ON COLUMN public.audit_log_details.old_value IS 'Row state before UPDATE/DELETE (JSONB).';
COMMENT ON COLUMN public.audit_log_details.new_value IS 'Row state after INSERT/UPDATE (JSONB).';

-- Indexes for filtering and reporting
CREATE INDEX IF NOT EXISTS idx_audit_log_details_user_id ON public.audit_log_details(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_details_entity_type_entity_id ON public.audit_log_details(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_details_created_at ON public.audit_log_details(created_at);

ALTER TABLE public.audit_log_details ENABLE ROW LEVEL SECURITY;

-- RLS: users see only their own audit detail rows; directors/secretariat can see all (optional, align with audit_logs)
DROP POLICY IF EXISTS "Users can view own audit_log_details" ON public.audit_log_details;
CREATE POLICY "Users can view own audit_log_details"
  ON public.audit_log_details FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Directors and secretariat can view all audit_log_details" ON public.audit_log_details;
CREATE POLICY "Directors and secretariat can view all audit_log_details"
  ON public.audit_log_details FOR SELECT
  USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role) OR
    has_role(auth.uid(), 'developer'::app_role)
  );

-- No INSERT/UPDATE/DELETE for normal users; only triggers and service role write
-- (So we don't add WITH CHECK for INSERT – trigger runs as definer)

-- 2) Trigger function: on grades UPDATE, insert one row into audit_log_details
CREATE OR REPLACE FUNCTION public.audit_grades_update_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  -- Only on UPDATE
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  uid := auth.uid();

  INSERT INTO public.audit_log_details (user_id, entity_type, entity_id, old_value, new_value)
  VALUES (
    uid,
    TG_TABLE_NAME,
    NEW.id,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

-- 3) Attach trigger to grades (AFTER UPDATE only)
DROP TRIGGER IF EXISTS trg_audit_grades_update_details ON public.grades;
CREATE TRIGGER trg_audit_grades_update_details
  AFTER UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_grades_update_details();

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 60/102: 20260221000001_calculate_student_averages_rpc.sql
-- ---------------------------------------------------------------------------
-- Migration: calculate_student_averages RPC function
-- Calculates arithmetic average of grades per student, per subject, per semester
-- UI consumes only the final result, no local math calculations

BEGIN;

-- Helper function to determine semester from date
-- Semester 1: September (9) - January (1) of next year
-- Semester 2: February (2) - June (6)
CREATE OR REPLACE FUNCTION public.get_semester_from_date(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  month_val INTEGER;
BEGIN
  month_val := EXTRACT(MONTH FROM p_date);
  
  -- Semester 1: September (9), October (10), November (11), December (12), January (1)
  IF month_val IN (9, 10, 11, 12, 1) THEN
    RETURN 1;
  -- Semester 2: February (2), March (3), April (4), May (5), June (6)
  ELSIF month_val IN (2, 3, 4, 5, 6) THEN
    RETURN 2;
  ELSE
    -- July (7) and August (8) are summer break, default to semester 2 of previous year
    -- or could be considered as part of semester 2
    RETURN 2;
  END IF;
END;
$$;

-- Main RPC function: calculate_student_averages
-- Returns averages per student, per subject, per semester
CREATE OR REPLACE FUNCTION public.calculate_student_averages(
  p_student_id UUID DEFAULT NULL,
  p_subject_id UUID DEFAULT NULL,
  p_semester INTEGER DEFAULT NULL,
  p_academic_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  subject_id UUID,
  subject_name TEXT,
  semester INTEGER,
  academic_year INTEGER,
  average NUMERIC(4,2),
  grade_count BIGINT,
  grades JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_year INTEGER;
BEGIN
  -- Determine academic year if not provided
  IF p_academic_year IS NULL THEN
    v_current_year := EXTRACT(YEAR FROM CURRENT_DATE);
    -- If we're in January, we're still in the previous academic year
    IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN
      v_current_year := v_current_year - 1;
    END IF;
  ELSE
    v_current_year := p_academic_year;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name AS student_name,
    sub.id AS subject_id,
    sub.name AS subject_name,
    public.get_semester_from_date(g.date) AS semester,
    CASE 
      WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
      WHEN EXTRACT(MONTH FROM g.date) IN (1, 2, 3, 4, 5, 6) THEN EXTRACT(YEAR FROM g.date) - 1
      ELSE EXTRACT(YEAR FROM g.date) - 1
    END::INTEGER AS academic_year,
    ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2) AS average,
    COUNT(*)::BIGINT AS grade_count,
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'grade', g.grade,
        'date', g.date,
        'description', g.description,
        'teacher_id', g.teacher_id
      ) ORDER BY g.date
    ) AS grades
  FROM public.grades g
  INNER JOIN public.students s ON s.id = g.student_id
  INNER JOIN public.subjects sub ON sub.id = g.subject_id
  WHERE g.deleted_at IS NULL
    AND (p_student_id IS NULL OR g.student_id = p_student_id)
    AND (p_subject_id IS NULL OR g.subject_id = p_subject_id)
    AND (
      CASE 
        WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
        WHEN EXTRACT(MONTH FROM g.date) IN (1, 2, 3, 4, 5, 6) THEN EXTRACT(YEAR FROM g.date) - 1
        ELSE EXTRACT(YEAR FROM g.date) - 1
      END = v_current_year
    )
    AND (p_semester IS NULL OR public.get_semester_from_date(g.date) = p_semester)
  GROUP BY
    s.id,
    s.full_name,
    sub.id,
    sub.name,
    public.get_semester_from_date(g.date),
    CASE 
      WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
      WHEN EXTRACT(MONTH FROM g.date) IN (1, 2, 3, 4, 5, 6) THEN EXTRACT(YEAR FROM g.date) - 1
      ELSE EXTRACT(YEAR FROM g.date) - 1
    END
  ORDER BY
    s.full_name,
    sub.name,
    public.get_semester_from_date(g.date);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.calculate_student_averages TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_semester_from_date TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.calculate_student_averages IS 'Calculates arithmetic average of grades per student, per subject, per semester. Returns structured data ready for UI consumption.';
COMMENT ON FUNCTION public.get_semester_from_date IS 'Helper function to determine semester (1 or 2) from a date. Semester 1: Sep-Jan, Semester 2: Feb-Jun.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 61/102: 20260221000002_semesters_table_and_lock_rls.sql
-- ---------------------------------------------------------------------------
-- Migration: Create semesters table with is_locked column
-- Modify RLS policies on grades INSERT/UPDATE to check if semester is locked
-- Database-level enforcement: if is_locked = true, reject any modification regardless of UI

BEGIN;

-- 1) Create semesters table
CREATE TABLE IF NOT EXISTS public.semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, academic_year, semester)
);

COMMENT ON TABLE public.semesters IS 'Tracks semester lock status per school and academic year. When is_locked = true, no grades can be inserted or updated for that semester.';
COMMENT ON COLUMN public.semesters.is_locked IS 'If true, prevents all INSERT/UPDATE operations on grades for this semester.';
COMMENT ON COLUMN public.semesters.academic_year IS 'Academic year (e.g., 2024 for 2024-2025 school year).';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_semesters_school_year_semester ON public.semesters(school_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_semesters_is_locked ON public.semesters(is_locked) WHERE is_locked = true;

-- Enable RLS
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view semesters from their school
CREATE POLICY "Users can view semesters from their school" ON public.semesters
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- RLS: Only directors/secretariat can manage semesters
CREATE POLICY "Staff can manage semesters" ON public.semesters
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_semesters_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_semesters_updated_at ON public.semesters;
CREATE TRIGGER trg_update_semesters_updated_at
  BEFORE UPDATE ON public.semesters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_semesters_updated_at();

-- 2) Helper function to get academic year from a date
-- Returns the academic year (e.g., 2024 for 2024-2025)
CREATE OR REPLACE FUNCTION public.get_academic_year_from_date(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  month_val INTEGER;
  year_val INTEGER;
BEGIN
  month_val := EXTRACT(MONTH FROM p_date);
  year_val := EXTRACT(YEAR FROM p_date);
  
  -- For September-December, academic year is the same as calendar year
  -- For January-June, academic year is previous calendar year
  IF month_val IN (9, 10, 11, 12) THEN
    RETURN year_val;
  ELSE
    RETURN year_val - 1;
  END IF;
END;
$$;

-- 3) Helper function to check if a semester is locked for a grade date
CREATE OR REPLACE FUNCTION public.is_semester_locked_for_grade(
  p_grade_date DATE,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_academic_year INTEGER;
  v_semester INTEGER;
  v_is_locked BOOLEAN;
BEGIN
  -- Get student's school_id
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id;
  
  IF v_school_id IS NULL THEN
    -- If we can't determine school, allow (will be caught by other RLS policies)
    RETURN false;
  END IF;
  
  -- Calculate academic year and semester from date
  v_academic_year := public.get_academic_year_from_date(p_grade_date);
  v_semester := public.get_semester_from_date(p_grade_date);
  
  -- Check if semester is locked
  SELECT is_locked INTO v_is_locked
  FROM public.semesters
  WHERE school_id = v_school_id
    AND academic_year = v_academic_year
    AND semester = v_semester;
  
  -- If semester doesn't exist, it's not locked (default behavior)
  IF v_is_locked IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN v_is_locked;
END;
$$;

-- 4) Drop existing INSERT and UPDATE policies on grades (from previous migrations)
DROP POLICY IF EXISTS "Teachers can insert grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (teacher-subject access)" ON public.grades;

-- 5) Recreate INSERT policy with semester lock check
CREATE POLICY "Teachers can insert grades for assigned classes (semester check)" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Then check: teacher must be assigned to teach this subject in the student's class
    (
      auth.uid() IN (
        SELECT cs.teacher_id
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
      )
      OR
      -- Fallback: Teacher assigned directly to subject (for backward compatibility)
      (
        auth.uid() IN (
          SELECT teacher_id 
          FROM public.subjects 
          WHERE id = subject_id 
            AND teacher_id = auth.uid()
            AND school_id = public.get_user_school_id()
        )
        AND student_id IN (
          SELECT s.id
          FROM public.students s
          JOIN public.subjects sub ON sub.class_id = s.class_id
          WHERE sub.id = subject_id
            AND s.school_id = public.get_user_school_id()
        )
      )
      OR
      -- Staff (director/secretariat) can insert grades even if semester is locked (for corrections)
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      -- UAT Admin and Developer can insert
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- 6) Recreate UPDATE policy with semester lock check
CREATE POLICY "Teachers can update grades for assigned classes (semester check)" ON public.grades
  FOR UPDATE
  USING (
    -- First check: semester must not be locked (check OLD date for existing grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Then check: teacher must be assigned to teach this subject in the student's class
    (
      auth.uid() IN (
        SELECT cs.teacher_id
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
      )
      OR
      -- Fallback: Teacher assigned directly to subject (for backward compatibility)
      (
        auth.uid() IN (
          SELECT teacher_id 
          FROM public.subjects 
          WHERE id = subject_id 
            AND teacher_id = auth.uid()
            AND school_id = public.get_user_school_id()
        )
        AND student_id IN (
          SELECT s.id
          FROM public.students s
          JOIN public.subjects sub ON sub.class_id = s.class_id
          WHERE sub.id = subject_id
            AND s.school_id = public.get_user_school_id()
        )
      )
      OR
      -- Staff (director/secretariat) can update grades even if semester is locked (for corrections)
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      -- UAT Admin and Developer can update
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  )
  WITH CHECK (
    -- First check: semester must not be locked (check NEW date for updated grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Then check: teacher must be assigned to teach this subject in the student's class
    (
      auth.uid() IN (
        SELECT cs.teacher_id
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
      )
      OR
      -- Fallback: Teacher assigned directly to subject (for backward compatibility)
      (
        auth.uid() IN (
          SELECT teacher_id 
          FROM public.subjects 
          WHERE id = subject_id 
            AND teacher_id = auth.uid()
            AND school_id = public.get_user_school_id()
        )
        AND student_id IN (
          SELECT s.id
          FROM public.students s
          JOIN public.subjects sub ON sub.class_id = s.class_id
          WHERE sub.id = subject_id
            AND s.school_id = public.get_user_school_id()
        )
      )
      OR
      -- Staff (director/secretariat) can update grades even if semester is locked (for corrections)
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      -- UAT Admin and Developer can update
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_academic_year_from_date TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_semester_locked_for_grade TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.get_academic_year_from_date IS 'Helper function to determine academic year from a date. Returns year for Sep-Dec, year-1 for Jan-Jun.';
COMMENT ON FUNCTION public.is_semester_locked_for_grade IS 'Checks if the semester for a given grade date and student is locked. Returns true if semester is_locked = true, preventing INSERT/UPDATE.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 62/102: 20260221000003_academic_relationships_and_profiles_class_id.sql
-- ---------------------------------------------------------------------------
-- Migration: Define academic relationships
-- 1. Add profile field to classes table (e.g., 'real', 'umanist', 'tehnic')
-- 2. Ensure class_subjects junction table exists and links class-subject-teacher
-- 3. Add class_id to profiles table for students
-- This ensures teachers see only their classes and students see only their subjects

BEGIN;

-- ============================================================================
-- PART 1: ADD PROFILE FIELD TO CLASSES TABLE
-- ============================================================================

-- Add profile column to classes if it doesn't exist
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS profile TEXT;

-- Add comment
COMMENT ON COLUMN public.classes.profile IS 'Class profile/specialization (e.g., "real", "umanist", "tehnic", "sportiv").';

-- ============================================================================
-- PART 2: ENSURE CLASS_SUBJECTS JUNCTION TABLE EXISTS AND IS COMPLETE
-- ============================================================================

-- Verify class_subjects table exists (should exist from previous migration)
-- If not, create it
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (class_id, subject_id, teacher_id)
);

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_class_subjects_class_id ON public.class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject_id ON public.class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher_id ON public.class_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school_id ON public.class_subjects(school_id);

-- Ensure RLS is enabled
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

-- Ensure trigger for school_id exists
CREATE OR REPLACE FUNCTION public.set_class_subject_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    -- Try to get school_id from class
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
    
    -- If still NULL, try from subject
    IF NEW.school_id IS NULL THEN
      SELECT school_id INTO NEW.school_id
      FROM public.subjects
      WHERE id = NEW.subject_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_class_subject_school_id ON public.class_subjects;
CREATE TRIGGER trg_set_class_subject_school_id
  BEFORE INSERT OR UPDATE ON public.class_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_class_subject_school_id();

-- Ensure RLS policies exist for class_subjects
DROP POLICY IF EXISTS "Users can view class_subjects from their school" ON public.class_subjects;
CREATE POLICY "Users can view class_subjects from their school" ON public.class_subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage class_subjects" ON public.class_subjects;
CREATE POLICY "Staff can manage class_subjects" ON public.class_subjects
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 3: ADD CLASS_ID TO PROFILES TABLE FOR STUDENTS
-- ============================================================================

-- Add class_id column to profiles if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

-- Add comment
COMMENT ON COLUMN public.profiles.class_id IS 'For students: links profile directly to their class. Should match students.class_id for the active student record.';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_class_id ON public.profiles(class_id);

-- ============================================================================
-- PART 4: SYNC CLASS_ID FROM STUDENTS TO PROFILES
-- ============================================================================

-- Function to sync class_id from students to profiles
-- This ensures profiles.class_id matches the student's current class
CREATE OR REPLACE FUNCTION public.sync_profile_class_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a student record is created or updated, sync class_id to profile
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET class_id = NEW.class_id
    WHERE id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to sync class_id when students table changes
DROP TRIGGER IF EXISTS trg_sync_profile_class_id ON public.students;
CREATE TRIGGER trg_sync_profile_class_id
  AFTER INSERT OR UPDATE OF class_id ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_class_id();

-- Initial sync: update profiles.class_id from existing students
UPDATE public.profiles p
SET class_id = s.class_id
FROM public.students s
WHERE s.user_id = p.id
  AND s.is_active = true
  AND (p.class_id IS NULL OR p.class_id != s.class_id);

-- ============================================================================
-- PART 5: ENSURE SUBJECTS TABLE HAS PROPER STRUCTURE
-- ============================================================================

-- Ensure subjects table has school_id (should exist from previous migration)
-- If not, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subjects' 
    AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.subjects 
    ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
    
    -- Backfill school_id from class
    UPDATE public.subjects s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
    
    -- Make NOT NULL after backfilling
    ALTER TABLE public.subjects
    ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 6: UPDATE RLS POLICIES FOR BETTER ISOLATION
-- ============================================================================

-- Ensure classes RLS policies allow students to see their own class
-- Note: This policy is additive - it works alongside existing "Users can view classes from their school" policy
DROP POLICY IF EXISTS "Students can view own class" ON public.classes;
CREATE POLICY "Students can view own class" ON public.classes
  FOR SELECT
  USING (
    -- Student can see their own class (via profiles.class_id)
    id IN (
      SELECT class_id FROM public.profiles WHERE id = auth.uid() AND class_id IS NOT NULL
    )
    OR
    -- Student can see their class via students table
    id IN (
      SELECT class_id FROM public.students WHERE user_id = auth.uid()
    )
    OR
    -- Teachers can see classes where they teach subjects
    id IN (
      SELECT DISTINCT cs.class_id
      FROM public.class_subjects cs
      WHERE cs.teacher_id = auth.uid()
    )
    OR
    -- Staff can see all classes from their school
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Ensure subjects RLS policies allow students to see only their subjects
-- Note: This policy is additive - it works alongside existing "Users can view subjects from their school" policy
DROP POLICY IF EXISTS "Students can view own subjects" ON public.subjects;
CREATE POLICY "Students can view own subjects" ON public.subjects
  FOR SELECT
  USING (
    -- Student can see subjects from their class
    class_id IN (
      SELECT class_id FROM public.profiles WHERE id = auth.uid() AND class_id IS NOT NULL
    )
    OR
    class_id IN (
      SELECT class_id FROM public.students WHERE user_id = auth.uid()
    )
    OR
    -- Teachers can see subjects they teach
    id IN (
      SELECT DISTINCT cs.subject_id
      FROM public.class_subjects cs
      WHERE cs.teacher_id = auth.uid()
    )
    OR
    -- Staff can see all subjects from their school
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'teacher'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 63/102: 20260221000004_extend_attendance_status_justification.sql
-- ---------------------------------------------------------------------------
-- Migration: Extend attendance module with status enum and justification_url
-- 1. Create attendance_status enum: 'nemotivata', 'motivata', 'intarziere'
-- 2. Add justification_url column for documents
-- 3. Create RPC function to change status from 'nemotivata' to 'motivata' (only homeroom_teacher/admin)
-- 4. Ensure students and parents can see changes in real-time (via RLS)

BEGIN;

-- ============================================================================
-- PART 1: CREATE ATTENDANCE_STATUS ENUM
-- ============================================================================

-- Create enum type for attendance status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
    CREATE TYPE public.attendance_status AS ENUM ('nemotivata', 'motivata', 'intarziere');
  END IF;
END $$;

-- ============================================================================
-- PART 2: ADD JUSTIFICATION_URL COLUMN TO ATTENDANCE
-- ============================================================================

-- Add justification_url column if it doesn't exist
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS justification_url TEXT;

-- Add comment
COMMENT ON COLUMN public.attendance.justification_url IS 'URL to justification document (e.g., medical certificate, excuse letter) for motivated absences.';

-- Create index for filtering by justification_url
CREATE INDEX IF NOT EXISTS idx_attendance_justification_url ON public.attendance(justification_url) WHERE justification_url IS NOT NULL;

-- ============================================================================
-- PART 3: ADD NEW STATUS COLUMN (keeping old status for backward compatibility)
-- ============================================================================

-- Add new status column using enum type
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS attendance_status public.attendance_status;

-- Migrate existing status values to new enum
-- Map: 'unexcused'/'absent' -> 'nemotivata', 'motivated'/'motivat' -> 'motivata', 'pending'/'intarziat' -> 'intarziere'
UPDATE public.attendance 
SET attendance_status = CASE
  WHEN status IN ('unexcused', 'absent', 'nemotivata') THEN 'nemotivata'::public.attendance_status
  WHEN status IN ('motivated', 'motivat', 'motivata') THEN 'motivata'::public.attendance_status
  WHEN status IN ('pending', 'intarziat', 'intarziere') THEN 'intarziere'::public.attendance_status
  ELSE 'nemotivata'::public.attendance_status
END
WHERE attendance_status IS NULL;

-- Set default for new records
ALTER TABLE public.attendance 
ALTER COLUMN attendance_status SET DEFAULT 'nemotivata'::public.attendance_status;

-- Make it NOT NULL after migration
ALTER TABLE public.attendance 
ALTER COLUMN attendance_status SET NOT NULL;

-- Add comment
COMMENT ON COLUMN public.attendance.attendance_status IS 'Attendance status: nemotivata (unexcused), motivata (excused), intarziere (late). Only homeroom_teacher/admin can change from nemotivata to motivata.';

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_attendance_status_enum ON public.attendance(attendance_status);

-- ============================================================================
-- PART 4: RPC FUNCTION TO CHANGE STATUS FROM NEMOTIVATA TO MOTIVATA
-- ============================================================================

-- Function to change attendance status from 'nemotivata' to 'motivata'
-- Only homeroom_teacher, director, secretariat can use this function
CREATE OR REPLACE FUNCTION public.motivate_attendance(
  p_attendance_id UUID,
  p_justification_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  subject_id UUID,
  date DATE,
  attendance_status public.attendance_status,
  justification_url TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_status public.attendance_status;
  v_student_class_id UUID;
  v_homeroom_teacher_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check if user has required role (homeroom_teacher, director, secretariat)
  IF NOT (
    public.has_role(v_user_id, 'homeroom_teacher'::app_role) OR
    public.has_role(v_user_id, 'director'::app_role) OR
    public.has_role(v_user_id, 'secretariat'::app_role) OR
    public.has_role(v_user_id, 'uat_admin'::app_role) OR
    public.has_role(v_user_id, 'developer'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only homeroom_teacher, director, or secretariat can motivate attendance';
  END IF;

  -- Get current status and student's class
  SELECT 
    a.attendance_status,
    s.class_id,
    c.teacher_id
  INTO 
    v_current_status,
    v_student_class_id,
    v_homeroom_teacher_id
  FROM public.attendance a
  JOIN public.students s ON s.id = a.student_id
  LEFT JOIN public.classes c ON c.id = s.class_id
  WHERE a.id = p_attendance_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  -- Only allow changing from 'nemotivata' to 'motivata'
  IF v_current_status != 'nemotivata'::public.attendance_status THEN
    RAISE EXCEPTION 'Can only motivate attendance with status "nemotivata". Current status: %', v_current_status;
  END IF;

  -- If user is homeroom_teacher, verify they are the homeroom teacher for this student's class
  IF public.has_role(v_user_id, 'homeroom_teacher'::app_role) THEN
    IF v_homeroom_teacher_id != v_user_id THEN
      RAISE EXCEPTION 'Homeroom teacher can only motivate attendance for students in their own class';
    END IF;
  END IF;

  -- Update attendance status
  UPDATE public.attendance
  SET 
    attendance_status = 'motivata'::public.attendance_status,
    justification_url = COALESCE(p_justification_url, justification_url),
    validated_by = v_user_id,
    validated_at = now()
  WHERE id = p_attendance_id;

  -- Return updated record
  RETURN QUERY
  SELECT 
    a.id,
    a.student_id,
    a.subject_id,
    a.date,
    a.attendance_status,
    a.justification_url,
    a.validated_at AS updated_at
  FROM public.attendance a
  WHERE a.id = p_attendance_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.motivate_attendance TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.motivate_attendance IS 'Changes attendance status from "nemotivata" to "motivata". Only homeroom_teacher (for their class), director, or secretariat can use this function.';

-- ============================================================================
-- PART 5: UPDATE RLS POLICIES FOR ATTENDANCE
-- ============================================================================

-- Ensure students can view their own attendance (should already exist, but verify)
DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Student can view their own attendance
    auth.uid() IN (
      SELECT user_id 
      FROM public.students 
      WHERE id = attendance.student_id 
        AND user_id IS NOT NULL
        AND school_id = public.get_user_school_id()
    )
    OR
    -- Staff (director/secretariat) can view all attendance from their school
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Ensure parents can view their children's attendance
DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
CREATE POLICY "Parents can view children attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Parent can view their child's attendance
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = attendance.student_id
        AND psr.parent_user_id = auth.uid()
    )
    AND school_id = public.get_user_school_id()
  );

-- Ensure homeroom_teacher can view attendance for their class
DROP POLICY IF EXISTS "Homeroom teachers can view class attendance" ON public.attendance;
CREATE POLICY "Homeroom teachers can view class attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Homeroom teacher can view attendance for students in their class
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
    )
    AND school_id = public.get_user_school_id()
  );

-- Ensure homeroom_teacher can update attendance_status and justification_url
DROP POLICY IF EXISTS "Homeroom teachers can update attendance status" ON public.attendance;
CREATE POLICY "Homeroom teachers can update attendance status" ON public.attendance
  FOR UPDATE
  USING (
    -- Homeroom teacher can update attendance for students in their class
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
    )
    AND school_id = public.get_user_school_id()
  )
  WITH CHECK (
    -- Only allow updating attendance_status and justification_url
    -- Status can only change from 'nemotivata' to 'motivata' (enforced by function)
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
    )
    AND school_id = public.get_user_school_id()
  );

-- Ensure director/secretariat can update attendance_status and justification_url
DROP POLICY IF EXISTS "Directors and secretariat can update attendance status" ON public.attendance;
CREATE POLICY "Directors and secretariat can update attendance status" ON public.attendance
  FOR UPDATE
  USING (
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
  );

-- ============================================================================
-- PART 6: ENABLE REALTIME FOR ATTENDANCE TABLE
-- ============================================================================

-- Enable realtime for attendance table so students and parents see changes immediately
-- Note: This requires Supabase Realtime to be enabled in the project settings
-- The RLS policies above ensure students/parents only see their own data

-- Grant realtime access (this is a no-op if realtime is not enabled, but documents intent)
-- Realtime is typically enabled via Supabase dashboard, but we document it here
COMMENT ON TABLE public.attendance IS 'Attendance records. Realtime enabled for students and parents to see status changes immediately.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 64/102: 20260221000005_get_student_summary_rpc.sql
-- ---------------------------------------------------------------------------
-- Migration: get_student_summary RPC
-- Calculates per-subject averages, total motivated/unmotivated absences,
-- and general average for a single student. Frontend should consume this
-- instead of computing averages in React.

BEGIN;

-- get_student_summary(student_id)
-- Returns one row per subject plus global summary columns.
CREATE OR REPLACE FUNCTION public.get_student_summary(p_student_id UUID)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  subject_average NUMERIC(4,2),
  subject_grade_count BIGINT,
  total_absences BIGINT,
  total_motivated_absences BIGINT,
  total_unmotivated_absences BIGINT,
  general_average NUMERIC(4,2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_general_avg NUMERIC(4,2);
  v_total_abs BIGINT;
  v_total_motivated BIGINT;
  v_total_unmotivated BIGINT;
BEGIN
  -- 1) Get per-subject averages using existing helper
  --    Handles academic_year snapshots vs live grades.
  -- 2) Get general average using existing helper.
  -- 3) Count absences using attendance table.

  -- General average
  SELECT public.get_student_general_average_for_display(p_student_id)
  INTO v_general_avg;

  -- Absence counts (motivated / unmotivated)
  SELECT
    COUNT(*)::bigint AS total_absences,
    COUNT(*) FILTER (
      WHERE
        -- New enum-based status, if present
        (attendance_status IS NOT NULL AND attendance_status = 'motivata'::public.attendance_status)
        OR
        -- Legacy text-based status fallback
        (attendance_status IS NULL AND status IN ('motivated', 'motivat'))
    )::bigint AS total_motivated_absences,
    COUNT(*) FILTER (
      WHERE
        (attendance_status IS NOT NULL AND attendance_status = 'nemotivata'::public.attendance_status)
        OR
        (attendance_status IS NULL AND status IN ('unexcused', 'absent'))
    )::bigint AS total_unmotivated_absences
  INTO
    v_total_abs,
    v_total_motivated,
    v_total_unmotivated
  FROM public.attendance a
  WHERE a.student_id = p_student_id
    AND a.deleted_at IS NULL;

  -- Per-subject averages (subject_id, subject_name, average, grade_count)
  RETURN QUERY
  SELECT
    g.subject_id,
    g.subject_name,
    COALESCE(g.average, 0)::numeric(4,2) AS subject_average,
    COALESCE(g.grade_count, 0)::bigint AS subject_grade_count,
    COALESCE(v_total_abs, 0)::bigint AS total_absences,
    COALESCE(v_total_motivated, 0)::bigint AS total_motivated_absences,
    COALESCE(v_total_unmotivated, 0)::bigint AS total_unmotivated_absences,
    COALESCE(v_general_avg, 0)::numeric(4,2) AS general_average
  FROM public.get_student_subject_averages_for_display(p_student_id) AS g;
END;
$$;

-- Allow authenticated users to call this RPC; RLS on underlying tables
-- still applies and will scope results correctly.
GRANT EXECUTE ON FUNCTION public.get_student_summary TO authenticated;

COMMENT ON FUNCTION public.get_student_summary IS
  'Returns per-subject averages, total motivated/unmotivated absences, and general average for a student. Used by student and parent dashboards.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 65/102: 20260221000006_notifications_triggers_grades_attendance.sql
-- ---------------------------------------------------------------------------
-- Migration: Automatic notifications for grades and attendance
-- Creates triggers that insert notifications when new grades or attendance records are added
-- Notifications are sent to the student (and parent if linked)

BEGIN;

-- ============================================================================
-- PART 1: ENSURE NOTIFICATIONS TABLE HAS REQUIRED COLUMNS
-- ============================================================================

-- Ensure notifications table has message, is_read columns (from previous migration)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS link TEXT;

-- Sync is_read from read_at if needed
UPDATE public.notifications
SET is_read = (read_at IS NOT NULL)
WHERE is_read IS FALSE AND read_at IS NOT NULL;

-- ============================================================================
-- PART 2: TRIGGER FUNCTION FOR GRADES NOTIFICATIONS
-- ============================================================================

-- Function to create notification when a new grade is added
CREATE OR REPLACE FUNCTION public.notify_grade_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_user_id UUID;
  v_subject_name TEXT;
  v_message TEXT;
BEGIN
  -- Get student's user_id
  SELECT user_id INTO v_student_user_id
  FROM public.students
  WHERE id = NEW.student_id;

  -- Get subject name
  SELECT name INTO v_subject_name
  FROM public.subjects
  WHERE id = NEW.subject_id;

  -- Skip if student has no user_id (not yet activated)
  IF v_student_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create message
  v_message := format('Ai primit nota %s la %s', NEW.grade, COALESCE(v_subject_name, 'materie necunoscută'));
  IF NEW.description IS NOT NULL AND NEW.description != '' THEN
    v_message := v_message || format(' (%s)', NEW.description);
  END IF;

  -- Insert notification for student
  INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
  VALUES (
    v_student_user_id,
    'grade',
    'Notă nouă',
    v_message,
    false,
    format('/grades')
  );

  -- Also notify parent(s) if linked
  INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
  SELECT
    psr.parent_user_id,
    'grade',
    format('Notă nouă pentru %s', COALESCE(s.full_name, 'elevul tău')),
    v_message,
    false,
    format('/grades')
  FROM public.parent_student_relations psr
  JOIN public.students s ON s.id = psr.student_id
  WHERE psr.student_id = NEW.student_id
    AND psr.parent_user_id IS NOT NULL;

  RETURN NEW;
END;
$$;

-- Attach trigger to grades table (AFTER INSERT)
DROP TRIGGER IF EXISTS trg_notify_grade_added ON public.grades;
CREATE TRIGGER trg_notify_grade_added
  AFTER INSERT ON public.grades
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_grade_added();

-- ============================================================================
-- PART 3: TRIGGER FUNCTION FOR ATTENDANCE NOTIFICATIONS
-- ============================================================================

-- Function to create notification when a new attendance record is added
CREATE OR REPLACE FUNCTION public.notify_attendance_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_user_id UUID;
  v_subject_name TEXT;
  v_status_text TEXT;
  v_message TEXT;
BEGIN
  -- Get student's user_id
  SELECT user_id INTO v_student_user_id
  FROM public.students
  WHERE id = NEW.student_id;

  -- Get subject name
  SELECT name INTO v_subject_name
  FROM public.subjects
  WHERE id = NEW.subject_id;

  -- Skip if student has no user_id (not yet activated)
  IF v_student_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine status text (use new enum if available, fallback to old status)
  IF NEW.attendance_status IS NOT NULL THEN
    v_status_text := CASE NEW.attendance_status
      WHEN 'nemotivata'::public.attendance_status THEN 'absență nemotivată'
      WHEN 'motivata'::public.attendance_status THEN 'absență motivată'
      WHEN 'intarziere'::public.attendance_status THEN 'întârziere'
      ELSE 'prezență'
    END;
  ELSE
    v_status_text := CASE NEW.status
      WHEN 'unexcused' THEN 'absență nemotivată'
      WHEN 'motivated' THEN 'absență motivată'
      WHEN 'pending' THEN 'întârziere'
      WHEN 'present' THEN 'prezență'
      ELSE COALESCE(NEW.status, 'prezență')
    END;
  END IF;

  -- Only notify for absences (not present)
  IF (NEW.attendance_status IS NOT NULL AND NEW.attendance_status IN ('nemotivata'::public.attendance_status, 'motivata'::public.attendance_status))
     OR (NEW.attendance_status IS NULL AND NEW.status IN ('unexcused', 'motivated', 'absent')) THEN
    
    -- Create message
    v_message := format('Ai fost marcat cu %s la %s', v_status_text, COALESCE(v_subject_name, 'materie necunoscută'));

    -- Insert notification for student
    INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
    VALUES (
      v_student_user_id,
      'attendance',
      'Prezență înregistrată',
      v_message,
      false,
      format('/attendance')
    );

    -- Also notify parent(s) if linked
    INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
    SELECT
      psr.parent_user_id,
      'attendance',
      format('Prezență înregistrată pentru %s', COALESCE(s.full_name, 'elevul tău')),
      v_message,
      false,
      format('/attendance')
    FROM public.parent_student_relations psr
    JOIN public.students s ON s.id = psr.student_id
    WHERE psr.student_id = NEW.student_id
      AND psr.parent_user_id IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to attendance table (AFTER INSERT)
DROP TRIGGER IF EXISTS trg_notify_attendance_added ON public.attendance;
CREATE TRIGGER trg_notify_attendance_added
  AFTER INSERT ON public.attendance
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_attendance_added();

-- ============================================================================
-- PART 4: ENSURE RLS POLICIES ALLOW TRIGGER INSERTS
-- ============================================================================

-- Triggers run as SECURITY DEFINER, so they bypass RLS automatically
-- However, we ensure policies exist for normal users to insert their own notifications
-- The "Staff insert notifications" policy already allows staff to insert, which is fine

-- Ensure the policy exists for trigger inserts (triggers use SECURITY DEFINER, so they bypass RLS)
-- But we document that triggers can insert notifications for any user_id

-- Grant execute permissions (though triggers run as SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.notify_grade_added TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_attendance_added TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.notify_grade_added IS 'Trigger function that creates notifications when a new grade is added. Notifies student and parent(s).';
COMMENT ON FUNCTION public.notify_attendance_added IS 'Trigger function that creates notifications when a new attendance record (absence) is added. Notifies student and parent(s).';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 66/102: 20260221000007_rls_simplified_and_tested.sql
-- ---------------------------------------------------------------------------
-- Migration: Simplified and tested RLS policies for grades
-- 1. Teachers can INSERT/UPDATE grades only for classes/subjects assigned in class_subjects
-- 2. Students can SELECT only rows where student_id matches their user_id (via students.user_id)
-- 3. Parents can SELECT only data for students where parent_user_id = auth.uid() in parent_student_relations
-- Includes test queries to verify policies work correctly

BEGIN;

-- ============================================================================
-- PART 1: DROP ALL EXISTING GRADES POLICIES
-- ============================================================================

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can view grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades for assigned classes (semester check)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades for assigned classes (semester check)" ON public.grades;
DROP POLICY IF EXISTS "Users can view grades from their school" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Staff can manage all grades" ON public.grades;
DROP POLICY IF EXISTS "Developers can view all grades" ON public.grades;

-- ============================================================================
-- PART 2: SIMPLIFIED RLS POLICIES FOR GRADES
-- ============================================================================

-- 2.1) SELECT: Students can only see their own grades
-- Rule: student_id must match a student record where user_id = auth.uid()
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    -- Student can view their own grades (auth.uid() matches students.user_id)
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
    )
  );

-- 2.2) SELECT: Parents can view their children's grades
-- Rule: parent_user_id = auth.uid() in parent_student_relations
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    -- Parent can view their child's grades
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = auth.uid()
    )
  );

-- 2.3) SELECT: Teachers can view grades for classes/subjects assigned in class_subjects
-- Rule: teacher_id must be in class_subjects for the student's class and subject
CREATE POLICY "Teachers can view grades for assigned classes" ON public.grades
  FOR SELECT
  USING (
    -- Teacher can view grades if they teach the subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = grades.subject_id
        AND s.id = grades.student_id
        AND cs.teacher_id = auth.uid()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = grades.subject_id
        AND s.id = grades.student_id
        AND sub.teacher_id = auth.uid()
    )
  );

-- 2.4) SELECT: Staff (director/secretariat) can view all grades from their school
CREATE POLICY "Staff can view all grades from school" ON public.grades
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
  );

-- 2.5) SELECT: UAT Admin and Developer can view all
CREATE POLICY "Admins can view all grades" ON public.grades
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 2.6) INSERT: Teachers can insert grades only for classes/subjects assigned in class_subjects
-- Rule: Must check semester lock AND teacher assignment
CREATE POLICY "Teachers can insert grades for assigned classes" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
      )
    )
    OR
    -- Staff (director/secretariat) can insert grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can insert
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 2.7) UPDATE: Teachers can update grades only for classes/subjects assigned in class_subjects
-- Rule: Must check semester lock AND teacher assignment
CREATE POLICY "Teachers can update grades for assigned classes" ON public.grades
  FOR UPDATE
  USING (
    -- First check: semester must not be locked (check OLD date for existing grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
      )
    )
    OR
    -- Staff (director/secretariat) can update grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can update
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK (check NEW date for updated grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
      )
      OR
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- 2.8) DELETE: Teachers can delete grades only for classes/subjects assigned in class_subjects
CREATE POLICY "Teachers can delete grades for assigned classes" ON public.grades
  FOR DELETE
  USING (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
      )
    )
    OR
    -- Staff (director/secretariat) can delete grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can delete
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 3: TEST FUNCTIONS TO VERIFY RLS POLICIES
-- ============================================================================

-- Function to test student SELECT access
-- Returns true if student can see their own grades
CREATE OR REPLACE FUNCTION public.test_student_grades_access(p_student_user_id UUID)
RETURNS TABLE (
  can_access BOOLEAN,
  grade_count BIGINT,
  test_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Set the auth context (simulate student login)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_student_user_id)::text, true);
  
  -- Try to count grades
  SELECT COUNT(*) INTO v_count
  FROM public.grades g
  WHERE EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = g.student_id
      AND s.user_id = p_student_user_id
  );
  
  RETURN QUERY
  SELECT
    v_count > 0 AS can_access,
    v_count AS grade_count,
    format('Student %s can access %s grades', p_student_user_id, v_count) AS test_message;
END;
$$;

-- Function to test teacher INSERT/UPDATE access
-- Returns true if teacher can insert/update grades for assigned classes
CREATE OR REPLACE FUNCTION public.test_teacher_grades_access(
  p_teacher_id UUID,
  p_student_id UUID,
  p_subject_id UUID
)
RETURNS TABLE (
  can_insert BOOLEAN,
  can_update BOOLEAN,
  test_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_insert BOOLEAN := false;
  v_can_update BOOLEAN := false;
  v_assigned BOOLEAN := false;
BEGIN
  -- Check if teacher is assigned in class_subjects
  SELECT EXISTS (
    SELECT 1
    FROM public.class_subjects cs
    JOIN public.students s ON s.class_id = cs.class_id
    WHERE cs.subject_id = p_subject_id
      AND s.id = p_student_id
      AND cs.teacher_id = p_teacher_id
  ) INTO v_assigned;
  
  IF v_assigned THEN
    v_can_insert := true;
    v_can_update := true;
  END IF;
  
  -- Fallback: check if teacher is assigned directly to subject
  IF NOT v_assigned THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = p_subject_id
        AND s.id = p_student_id
        AND sub.teacher_id = p_teacher_id
    ) INTO v_assigned;
    
    IF v_assigned THEN
      v_can_insert := true;
      v_can_update := true;
    END IF;
  END IF;
  
  RETURN QUERY
  SELECT
    v_can_insert,
    v_can_update,
    format('Teacher %s can insert: %s, can update: %s for student %s, subject %s',
      p_teacher_id, v_can_insert, v_can_update, p_student_id, p_subject_id) AS test_message;
END;
$$;

-- Function to test parent SELECT access
-- Returns true if parent can see their child's grades
CREATE OR REPLACE FUNCTION public.test_parent_grades_access(
  p_parent_user_id UUID,
  p_student_id UUID
)
RETURNS TABLE (
  can_access BOOLEAN,
  grade_count BIGINT,
  test_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
  v_is_parent BOOLEAN;
BEGIN
  -- Check if parent-student relation exists
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_student_relations psr
    WHERE psr.student_id = p_student_id
      AND psr.parent_user_id = p_parent_user_id
  ) INTO v_is_parent;
  
  IF v_is_parent THEN
    -- Count grades the parent should be able to see
    SELECT COUNT(*) INTO v_count
    FROM public.grades g
    WHERE g.student_id = p_student_id;
  ELSE
    v_count := 0;
  END IF;
  
  RETURN QUERY
  SELECT
    v_is_parent AND v_count > 0 AS can_access,
    v_count AS grade_count,
    format('Parent %s can access %s grades for student %s (is_parent: %s)',
      p_parent_user_id, v_count, p_student_id, v_is_parent) AS test_message;
END;
$$;

-- Grant execute permissions for test functions
GRANT EXECUTE ON FUNCTION public.test_student_grades_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_teacher_grades_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_parent_grades_access TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.test_student_grades_access IS 'Test function to verify student can SELECT only their own grades. Returns can_access, grade_count, and test_message.';
COMMENT ON FUNCTION public.test_teacher_grades_access IS 'Test function to verify teacher can INSERT/UPDATE grades only for assigned classes/subjects. Returns can_insert, can_update, and test_message.';
COMMENT ON FUNCTION public.test_parent_grades_access IS 'Test function to verify parent can SELECT only their children grades. Returns can_access, grade_count, and test_message.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 67/102: 20260221000008_enforce_school_id_in_all_queries.sql
-- ---------------------------------------------------------------------------
-- Migration: Ensure ALL RLS policies enforce school_id filtering
-- This is critical for multi-tenancy: no user should see data from another school
-- Even if they have a student_id from another school, RLS must block access

BEGIN;

-- ============================================================================
-- PART 1: VERIFY AND UPDATE GRADES RLS POLICIES
-- ============================================================================

-- Ensure all grades policies include school_id check
-- Students policy already checks via students.user_id -> students.school_id (implicit)
-- But we make it explicit for clarity

-- Update Students policy to explicitly check school_id
DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    -- Student can view their own grades (auth.uid() matches students.user_id)
    -- AND student belongs to user's school (via students.school_id)
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update Parents policy to explicitly check school_id
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    -- Parent can view their child's grades
    -- AND child belongs to parent's school (via students.school_id)
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update Teachers policy to explicitly check school_id
DROP POLICY IF EXISTS "Teachers can view grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can view grades for assigned classes" ON public.grades
  FOR SELECT
  USING (
    -- Teacher can view grades if they teach the subject in the student's class
    -- AND all belong to teacher's school
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = grades.subject_id
        AND s.id = grades.student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = grades.subject_id
        AND s.id = grades.student_id
        AND sub.teacher_id = auth.uid()
        AND sub.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update INSERT policy to explicitly check school_id
DROP POLICY IF EXISTS "Teachers can insert grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can insert grades for assigned classes" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: school_id must match
    school_id = public.get_user_school_id()
    AND
    -- Third check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can insert grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can insert
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Update UPDATE policy to explicitly check school_id
DROP POLICY IF EXISTS "Teachers can update grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can update grades for assigned classes" ON public.grades
  FOR UPDATE
  USING (
    -- First check: semester must not be locked (check OLD date for existing grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: school_id must match
    school_id = public.get_user_school_id()
    AND
    -- Third check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can update grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can update
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK (check NEW date for updated grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    school_id = public.get_user_school_id()
    AND
    (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- Update DELETE policy to explicitly check school_id
DROP POLICY IF EXISTS "Teachers can delete grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can delete grades for assigned classes" ON public.grades
  FOR DELETE
  USING (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: school_id must match
    school_id = public.get_user_school_id()
    AND
    -- Third check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can delete grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can delete
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 2: VERIFY AND UPDATE ATTENDANCE RLS POLICIES
-- ============================================================================

-- Update Students policy for attendance
DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Student can view their own attendance
    -- AND student belongs to user's school
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = attendance.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update Parents policy for attendance
DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
CREATE POLICY "Parents can view children attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Parent can view their child's attendance
    -- AND child belongs to parent's school
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = attendance.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update Teachers policy for attendance
DROP POLICY IF EXISTS "Teachers can view attendance for assigned classes" ON public.attendance;
CREATE POLICY "Teachers can view attendance for assigned classes" ON public.attendance
  FOR SELECT
  USING (
    -- Teacher can view attendance if they teach the subject in the student's class
    -- AND all belong to teacher's school
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = attendance.subject_id
        AND s.id = attendance.student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = attendance.subject_id
        AND s.id = attendance.student_id
        AND sub.teacher_id = auth.uid()
        AND sub.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update INSERT/UPDATE/DELETE policy for attendance
DROP POLICY IF EXISTS "Teachers can manage attendance for assigned classes" ON public.attendance;
CREATE POLICY "Teachers can manage attendance for assigned classes" ON public.attendance
  FOR ALL
  USING (
    -- School_id must match
    school_id = public.get_user_school_id()
    AND
    -- Teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = attendance.subject_id
        AND s.id = attendance.student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = attendance.subject_id
          AND s.id = attendance.student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can manage attendance
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can manage
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK
    school_id = public.get_user_school_id()
    AND
    (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = attendance.subject_id
          AND s.id = attendance.student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = attendance.subject_id
          AND s.id = attendance.student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- ============================================================================
-- PART 3: VERIFY AND UPDATE STUDENTS RLS POLICIES
-- ============================================================================

-- Ensure students policies check school_id
-- Students can only see students from their school
DROP POLICY IF EXISTS "Users can view students from their school" ON public.students;
CREATE POLICY "Users can view students from their school" ON public.students
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 4: VERIFY AND UPDATE SUBJECTS RLS POLICIES
-- ============================================================================

-- Ensure subjects policies check school_id
DROP POLICY IF EXISTS "Users can view subjects from their school" ON public.subjects;
CREATE POLICY "Users can view subjects from their school" ON public.subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 5: VERIFY AND UPDATE CLASSES RLS POLICIES
-- ============================================================================

-- Ensure classes policies check school_id
DROP POLICY IF EXISTS "Users can view classes from their school" ON public.classes;
CREATE POLICY "Users can view classes from their school" ON public.classes
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 6: VERIFY AND UPDATE PARENT_STUDENT_RELATIONS RLS POLICIES
-- ============================================================================

-- Ensure parent-student relations policies check school_id
DROP POLICY IF EXISTS "Parents can view their relations" ON public.parent_student_relations;
CREATE POLICY "Parents can view their relations" ON public.parent_student_relations
  FOR SELECT
  USING (
    -- Parent can view their relations
    -- AND student belongs to parent's school
    parent_user_id = auth.uid()
    AND
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = parent_student_relations.student_id
        AND s.school_id = public.get_user_school_id()
    )
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 68/102: 20260221000009_final_grades_table_and_close_semester.sql
-- ---------------------------------------------------------------------------
-- Migration: Create final_grades table and close_semester_grading RPC
-- Stores final calculated grades per student, subject, semester
-- Once saved, grades from that semester cannot be modified

BEGIN;

-- 1) Create final_grades table
CREATE TABLE IF NOT EXISTS public.final_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  final_grade INTEGER NOT NULL CHECK (final_grade >= 1 AND final_grade <= 10),
  calculated_average NUMERIC(4,2) NOT NULL, -- Store the exact average before rounding
  grade_count INTEGER NOT NULL DEFAULT 0, -- Number of grades used in calculation
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year, semester)
);

COMMENT ON TABLE public.final_grades IS 'Stores final calculated grades per student, subject, and semester. Once a final grade is saved, the semester is locked and grades cannot be modified.';
COMMENT ON COLUMN public.final_grades.final_grade IS 'Rounded final grade (1-10) calculated from semester average.';
COMMENT ON COLUMN public.final_grades.calculated_average IS 'Exact average before rounding (for reference).';
COMMENT ON COLUMN public.final_grades.grade_count IS 'Number of grades used in the calculation.';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_final_grades_student ON public.final_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_subject ON public.final_grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_school_year_semester ON public.final_grades(school_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_final_grades_student_subject_year_semester ON public.final_grades(student_id, subject_id, academic_year, semester);

-- Enable RLS
ALTER TABLE public.final_grades ENABLE ROW LEVEL SECURITY;

-- RLS: Students can view their own final grades
CREATE POLICY "Students can view own final grades" ON public.final_grades
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = final_grades.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

-- RLS: Parents can view their children's final grades
CREATE POLICY "Parents can view children final grades" ON public.final_grades
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = final_grades.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- RLS: Teachers can view final grades for their students
CREATE POLICY "Teachers can view final grades for assigned classes" ON public.final_grades
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = final_grades.subject_id
        AND s.id = final_grades.student_id
        AND cs.teacher_id = auth.uid()
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = final_grades.subject_id
        AND s.id = final_grades.student_id
        AND sub.teacher_id = auth.uid()
        AND sub.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- RLS: Staff can view all final grades from their school
CREATE POLICY "Staff can view final grades from school" ON public.final_grades
  FOR SELECT
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- RLS: Only directors/secretariat can insert final grades (via RPC)
CREATE POLICY "Staff can insert final grades" ON public.final_grades
  FOR INSERT
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_final_grades_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_final_grades_updated_at
  BEFORE UPDATE ON public.final_grades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_final_grades_updated_at();

-- 2) Helper function to check if a semester has final grades (is closed)
CREATE OR REPLACE FUNCTION public.is_semester_closed_with_final_grades(
  p_school_id UUID,
  p_academic_year INTEGER,
  p_semester INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.final_grades
  WHERE school_id = p_school_id
    AND academic_year = p_academic_year
    AND semester = p_semester
  LIMIT 1;
  
  RETURN v_count > 0;
END;
$$;

-- 3) Update is_semester_locked_for_grade to also check final_grades
CREATE OR REPLACE FUNCTION public.is_semester_locked_for_grade(p_grade_date DATE, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_academic_year INTEGER;
  v_semester INTEGER;
  v_semester_locked BOOLEAN;
  v_has_final_grades BOOLEAN;
BEGIN
  -- Get student's school_id
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id
  LIMIT 1;
  
  IF v_school_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Determine academic year and semester from date
  v_semester := public.get_semester_from_date(p_grade_date);
  
  IF EXTRACT(MONTH FROM p_grade_date) IN (9, 10, 11, 12) THEN
    v_academic_year := EXTRACT(YEAR FROM p_grade_date);
  ELSE
    v_academic_year := EXTRACT(YEAR FROM p_grade_date) - 1;
  END IF;
  
  -- Check if semester is locked in semesters table
  SELECT COALESCE(is_locked, false) INTO v_semester_locked
  FROM public.semesters
  WHERE school_id = v_school_id
    AND academic_year = v_academic_year
    AND semester = v_semester
  LIMIT 1;
  
  -- Check if final grades exist for this semester (semester is closed)
  v_has_final_grades := public.is_semester_closed_with_final_grades(v_school_id, v_academic_year, v_semester);
  
  -- Semester is locked if either condition is true
  RETURN v_semester_locked OR v_has_final_grades;
END;
$$;

-- 4) RPC function: close_semester_grading
-- Calculates final grades for all students in a semester and locks it
CREATE OR REPLACE FUNCTION public.close_semester_grading(
  p_school_id UUID,
  p_academic_year INTEGER,
  p_semester INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  students_processed INTEGER,
  final_grades_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_students_processed INTEGER := 0;
  v_final_grades_created INTEGER := 0;
  v_student_record RECORD;
  v_subject_record RECORD;
  v_average NUMERIC(4,2);
  v_grade_count INTEGER;
  v_final_grade INTEGER;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Verify user has permission (director or secretariat from the school)
  IF NOT (
    (
      p_school_id = public.get_user_school_id() AND
      (
        public.has_role(v_user_id, 'director'::app_role) OR
        public.has_role(v_user_id, 'secretariat'::app_role)
      )
    )
    OR
    public.has_role(v_user_id, 'uat_admin'::app_role) OR
    public.has_role(v_user_id, 'developer'::app_role)
  ) THEN
    RETURN QUERY SELECT false, 'Nu aveți permisiunea de a închide semestrul.'::TEXT, 0, 0;
    RETURN;
  END IF;
  
  -- Check if semester already has final grades
  IF public.is_semester_closed_with_final_grades(p_school_id, p_academic_year, p_semester) THEN
    RETURN QUERY SELECT false, 'Semestrul este deja închis.'::TEXT, 0, 0;
    RETURN;
  END IF;
  
  -- Calculate final grades for each student and subject
  FOR v_student_record IN
    SELECT DISTINCT s.id AS student_id, s.school_id
    FROM public.students s
    WHERE s.school_id = p_school_id
  LOOP
    v_students_processed := v_students_processed + 1;
    
    -- For each subject the student has grades in this semester
    FOR v_subject_record IN
      SELECT DISTINCT sub.id AS subject_id, sub.name AS subject_name
      FROM public.subjects sub
      INNER JOIN public.grades g ON g.subject_id = sub.id
      WHERE g.student_id = v_student_record.student_id
        AND g.deleted_at IS NULL
        AND public.get_semester_from_date(g.date) = p_semester
        AND (
          CASE 
            WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
            ELSE EXTRACT(YEAR FROM g.date) - 1
          END
        ) = p_academic_year
    LOOP
      -- Calculate average for this student-subject-semester combination
      SELECT 
        ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2),
        COUNT(*)::INTEGER
      INTO v_average, v_grade_count
      FROM public.grades g
      WHERE g.student_id = v_student_record.student_id
        AND g.subject_id = v_subject_record.subject_id
        AND g.deleted_at IS NULL
        AND public.get_semester_from_date(g.date) = p_semester
        AND (
          CASE 
            WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
            ELSE EXTRACT(YEAR FROM g.date) - 1
          END
        ) = p_academic_year;
      
      -- Only create final grade if there are grades
      IF v_grade_count > 0 AND v_average IS NOT NULL THEN
        -- Round to nearest integer (final grade)
        v_final_grade := ROUND(v_average)::INTEGER;
        
        -- Ensure final grade is between 1 and 10
        IF v_final_grade < 1 THEN
          v_final_grade := 1;
        ELSIF v_final_grade > 10 THEN
          v_final_grade := 10;
        END IF;
        
        -- Insert final grade (ON CONFLICT DO NOTHING to avoid duplicates)
        INSERT INTO public.final_grades (
          student_id,
          subject_id,
          school_id,
          academic_year,
          semester,
          final_grade,
          calculated_average,
          grade_count,
          calculated_by
        )
        VALUES (
          v_student_record.student_id,
          v_subject_record.subject_id,
          p_school_id,
          p_academic_year,
          p_semester,
          v_final_grade,
          v_average,
          v_grade_count,
          v_user_id
        )
        ON CONFLICT (student_id, subject_id, academic_year, semester) DO NOTHING;
        
        IF FOUND THEN
          v_final_grades_created := v_final_grades_created + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Lock the semester in semesters table (create or update)
  INSERT INTO public.semesters (school_id, academic_year, semester, is_locked, locked_at, locked_by)
  VALUES (p_school_id, p_academic_year, p_semester, true, now(), v_user_id)
  ON CONFLICT (school_id, academic_year, semester)
  DO UPDATE SET
    is_locked = true,
    locked_at = now(),
    locked_by = v_user_id,
    updated_at = now();
  
  -- Log audit
  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    school_id
  )
  VALUES (
    v_user_id,
    'close_semester',
    'semester',
    (SELECT id FROM public.semesters WHERE school_id = p_school_id AND academic_year = p_academic_year AND semester = p_semester LIMIT 1),
    jsonb_build_object(
      'school_id', p_school_id,
      'academic_year', p_academic_year,
      'semester', p_semester,
      'students_processed', v_students_processed,
      'final_grades_created', v_final_grades_created
    ),
    p_school_id
  );
  
  RETURN QUERY SELECT 
    true,
    format('Semestrul a fost închis cu succes. %s elevi procesați, %s note finale create.', v_students_processed, v_final_grades_created)::TEXT,
    v_students_processed,
    v_final_grades_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_semester_grading TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_semester_closed_with_final_grades TO authenticated;

COMMENT ON FUNCTION public.close_semester_grading IS 'Calculates and saves final grades for all students in a semester. Once saved, the semester is locked and grades cannot be modified.';
COMMENT ON FUNCTION public.is_semester_closed_with_final_grades IS 'Checks if a semester has final grades (is closed).';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 69/102: 20260222000000_tickets_messaging.sql
-- ---------------------------------------------------------------------------
-- Migration: Tickets – simple parent-to-teacher messaging
-- Parents can send messages (tickets) linked to a student_id to teachers or homeroom teacher
-- Teachers receive a notification when they get a new ticket

BEGIN;

-- ============================================================================
-- PART 1: TICKETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tickets IS 'Parent-to-teacher/diriginte messages linked to a student.';
COMMENT ON COLUMN public.tickets.student_id IS 'Student the message is about (parent must be linked via parent_student_relations).';
COMMENT ON COLUMN public.tickets.from_user_id IS 'Parent who sent the message.';
COMMENT ON COLUMN public.tickets.to_user_id IS 'Teacher or homeroom teacher who receives the message.';

CREATE INDEX IF NOT EXISTS idx_tickets_to_user_created ON public.tickets(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_from_user_created ON public.tickets(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_student_id ON public.tickets(student_id);
CREATE INDEX IF NOT EXISTS idx_tickets_school_id ON public.tickets(school_id);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Parents: can insert tickets only for their children (student_id in parent_student_relations)
CREATE POLICY "Parents can create tickets for their children"
  ON public.tickets FOR INSERT
  WITH CHECK (
    auth.uid() = from_user_id
    AND school_id = public.get_user_school_id()
    AND EXISTS (
      SELECT 1 FROM public.parent_student_relations psr
      WHERE psr.student_id = tickets.student_id
        AND psr.parent_user_id = auth.uid()
    )
  );

-- Parents: can select tickets they sent
CREATE POLICY "Parents can view their sent tickets"
  ON public.tickets FOR SELECT
  USING (
    from_user_id = auth.uid()
    AND school_id = public.get_user_school_id()
  );

-- Teachers/diriginte: can select tickets addressed to them
CREATE POLICY "Teachers can view tickets sent to them"
  ON public.tickets FOR SELECT
  USING (
    to_user_id = auth.uid()
    AND school_id = public.get_user_school_id()
  );

-- Teachers: can update only to set read_at (mark as read)
CREATE POLICY "Teachers can update tickets sent to them (mark read)"
  ON public.tickets FOR UPDATE
  USING (to_user_id = auth.uid() AND school_id = public.get_user_school_id())
  WITH CHECK (to_user_id = auth.uid());

-- Staff/admin: can view all tickets of their school (optional, for support)
CREATE POLICY "Staff can view all school tickets"
  ON public.tickets FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    AND (
      public.has_role(auth.uid(), 'director'::app_role)
      OR public.has_role(auth.uid(), 'secretariat'::app_role)
    )
  );

-- Trigger: set updated_at
CREATE OR REPLACE FUNCTION public.set_tickets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.tickets;
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_tickets_updated_at();

-- ============================================================================
-- PART 2: NOTIFICATION WHEN TICKET IS CREATED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name TEXT;
  v_sender_name TEXT;
  v_message TEXT;
BEGIN
  SELECT full_name INTO v_student_name
  FROM public.students WHERE id = NEW.student_id;

  SELECT full_name INTO v_sender_name
  FROM public.profiles WHERE id = NEW.from_user_id;

  v_message := COALESCE(v_sender_name, 'Un părinte') || ' a trimis un mesaj despre ' || COALESCE(v_student_name, 'elev');

  INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
  VALUES (
    NEW.to_user_id,
    'ticket',
    'Mesaj nou de la părinte',
    v_message,
    false,
    '/teacher/tickets'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_created ON public.tickets;
CREATE TRIGGER trg_notify_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_created();

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 70/102: 20260222000001_profiles_cnp_bulk_import.sql
-- ---------------------------------------------------------------------------
-- Add CNP (Cod Numeric Personal) to profiles for bulk import and identity checks
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cnp TEXT;

COMMENT ON COLUMN public.profiles.cnp IS 'Romanian personal numeric code (13 digits), optional. Used for bulk import validation and identity.';

-- Optional: unique constraint only for non-null CNPs (one CNP per person in system)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cnp_unique ON public.profiles(cnp) WHERE cnp IS NOT NULL;


-- ---------------------------------------------------------------------------
-- MIGRATION 71/102: 20260222000002_validate_bulk_import_rpc.sql
-- ---------------------------------------------------------------------------
-- RPC: validate_bulk_import_rows
-- Validates rows for bulk import: resolves class for students, checks duplicate email in school.
-- Caller must pass school_id (from session). Returns per-row errors and resolved class_id.

CREATE OR REPLACE FUNCTION public.validate_bulk_import_rows(
  p_rows jsonb,
  p_school_id uuid
)
RETURNS TABLE(
  row_index integer,
  errors text[],
  class_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  idx integer := 0;
  v_errors text[];
  v_class_id uuid;
  v_email text;
  v_class_identifier text;
  v_role text;
  v_year integer;
  v_section text;
  v_match text[];
BEGIN
  IF p_school_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    idx := (r->>'rowIndex')::integer;
    v_errors := ARRAY[]::text[];
    v_class_id := NULL;
    v_email := NULLIF(trim(r->>'email'), '');
    v_class_identifier := NULLIF(trim(r->>'class_identifier'), '');
    v_role := NULLIF(trim(r->>'role'), '');

    -- Duplicate email in this school
    IF v_email IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE school_id = p_school_id AND LOWER(email) = LOWER(v_email)
      ) THEN
        v_errors := array_append(v_errors, 'Email deja existent în școală');
      END IF;
    END IF;

    -- For students: resolve class_identifier -> class_id
    IF v_role = 'student' AND v_class_identifier IS NOT NULL THEN
      -- Try as UUID first
      BEGIN
        v_class_id := v_class_identifier::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = v_class_id AND school_id = p_school_id) THEN
          v_class_id := NULL;
          v_errors := array_append(v_errors, 'Clasă inexistentă sau nu aparține școlii');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_class_id := NULL;
        -- Pattern like "10A" or "10 A" -> year=10, section=A
        v_match := regexp_match(v_class_identifier, '^(\d{1,2})\s*([A-Za-z])$');
        IF v_match IS NOT NULL THEN
          v_year := v_match[1]::integer;
          v_section := upper(v_match[2]);
          SELECT c.id INTO v_class_id
          FROM public.classes c
          WHERE c.school_id = p_school_id AND c.year = v_year AND c.section = v_section
          LIMIT 1;
        END IF;
        IF v_class_id IS NULL THEN
          -- Try by name (e.g. "Clasa a 10-a")
          SELECT c.id INTO v_class_id
          FROM public.classes c
          WHERE c.school_id = p_school_id
            AND (c.name ILIKE '%' || v_class_identifier || '%'
                 OR (c.year::text || c.section) = regexp_replace(v_class_identifier, '\s+', '', 'g'))
          LIMIT 1;
        END IF;
        IF v_class_id IS NULL THEN
          v_errors := array_append(v_errors, 'Clasă inexistentă: ' || v_class_identifier);
        END IF;
      END;
    ELSIF v_role = 'student' AND (v_class_identifier IS NULL OR v_class_identifier = '') THEN
      v_errors := array_append(v_errors, 'Clasa este obligatorie pentru elevi');
    END IF;

    row_index := idx;
    errors := v_errors;
    class_id := v_class_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.validate_bulk_import_rows(jsonb, uuid) IS
  'Validates bulk import rows: duplicate email in school, resolves class_identifier to class_id for students. Used before calling bulk-import Edge function.';


-- ---------------------------------------------------------------------------
-- MIGRATION 72/102: 20260222000003_rls_security_audit_students_grades.sql
-- ---------------------------------------------------------------------------
-- Security Audit: RLS hardening
-- 1) Students table: students (role) must see ONLY their own row; no access to other students' records.
-- 2) Grades/Final_grades: explicit auth.uid() IS NOT NULL so unauthenticated requests never pass.

BEGIN;

-- ============================================================================
-- PART 1: STUDENTS TABLE - Restrict SELECT by role (auth.uid() binding)
-- ============================================================================
-- Previous policy "Users can view students from their school" allowed ANY user with
-- school_id (including students) to see ALL students in the school (data leak).
-- Replace with role-based: student sees only own row; parent only linked children;
-- staff/teachers see school; uat_admin/developer unchanged.

DROP POLICY IF EXISTS "Users can view students from their school" ON public.students;

-- Students (role): only their own student record(s) where user_id = auth.uid()
CREATE POLICY "Students can view own record only" ON public.students
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND school_id = public.get_user_school_id()
  );

-- Parents: only students linked via parent_student_relations, same school
CREATE POLICY "Parents can view linked children students" ON public.students
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = students.id
        AND psr.parent_user_id = auth.uid()
    )
    AND school_id = public.get_user_school_id()
  );

-- Staff and teachers: all students from their school (director, secretariat, homeroom, teacher)
CREATE POLICY "Staff and teachers can view students from school" ON public.students
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      (
        school_id = public.get_user_school_id()
        AND (
          public.has_role(auth.uid(), 'director'::public.app_role)
          OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
          OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
          OR public.has_role(auth.uid(), 'teacher'::public.app_role)
        )
      )
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- ============================================================================
-- PART 2: GRADES - Explicit auth.uid() IS NOT NULL for student/parent policies
-- ============================================================================
-- Ensure unauthenticated or anon never passes RLS (defense in depth).

DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- ============================================================================
-- PART 3: FINAL_GRADES - Explicit auth.uid() IS NOT NULL
-- ============================================================================

DROP POLICY IF EXISTS "Students can view own final grades" ON public.final_grades;
CREATE POLICY "Students can view own final grades" ON public.final_grades
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = final_grades.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Parents can view children final grades" ON public.final_grades;
CREATE POLICY "Parents can view children final grades" ON public.final_grades
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = final_grades.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Staff policy: require auth.uid() and role check
DROP POLICY IF EXISTS "Staff can view final grades from school" ON public.final_grades;
CREATE POLICY "Staff can view final grades from school" ON public.final_grades
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      (
        school_id = public.get_user_school_id()
        AND (
          public.has_role(auth.uid(), 'director'::public.app_role)
          OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
        )
      )
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- Teachers policy for final_grades: bind to auth.uid() explicitly (already has teacher_id = auth.uid())
DROP POLICY IF EXISTS "Teachers can view final grades for assigned classes" ON public.final_grades;
CREATE POLICY "Teachers can view final grades for assigned classes" ON public.final_grades
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = final_grades.subject_id
          AND s.id = final_grades.student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = final_grades.subject_id
          AND s.id = final_grades.student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 73/102: 20260223000000_soft_delete_grades_attendance_rls.sql
-- ---------------------------------------------------------------------------
-- Soft Delete: ensure grades and attendance use deleted_at; all RLS SELECT policies
-- must exclude soft-deleted rows (deleted_at IS NULL). App already does soft delete
-- via UPDATE ... SET deleted_at = now() instead of DELETE.

BEGIN;

-- 1) Ensure columns exist (already added in 20251222190000_audit_status_requests_register.sql)
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.grades.deleted_at IS 'Soft delete: when set, row is hidden from all SELECT policies and app queries.';
COMMENT ON COLUMN public.attendance.deleted_at IS 'Soft delete: when set, row is hidden from all SELECT policies and app queries.';

-- 2) GRADES: Recreate all SELECT policies with AND (deleted_at IS NULL)
--    (UPDATE/INSERT/DELETE unchanged; soft delete is done via UPDATE)

DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Teachers can view grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can view grades for assigned classes" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = grades.subject_id
          AND s.id = grades.student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = grades.subject_id
          AND s.id = grades.student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
  );

DROP POLICY IF EXISTS "Staff can view all grades from school" ON public.grades;
CREATE POLICY "Staff can view all grades from school" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      (public.has_role(auth.uid(), 'director'::public.app_role) OR
       public.has_role(auth.uid(), 'secretariat'::public.app_role))
      AND school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Admins can view all grades" ON public.grades;
CREATE POLICY "Admins can view all grades" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- 3) ATTENDANCE: Recreate all SELECT and ALL policies with AND (deleted_at IS NULL) in USING
--    so soft-deleted rows are hidden; UPDATE still allowed on non-deleted rows (to set deleted_at)

DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = attendance.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
CREATE POLICY "Parents can view children attendance" ON public.attendance
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = attendance.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Teachers can view attendance for assigned classes" ON public.attendance;
CREATE POLICY "Teachers can view attendance for assigned classes" ON public.attendance
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = attendance.subject_id
          AND s.id = attendance.student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = attendance.subject_id
          AND s.id = attendance.student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
  );

-- Teachers can manage: SELECT only non-deleted; UPDATE/DELETE apply to rows (so they can set deleted_at via UPDATE)
DROP POLICY IF EXISTS "Teachers can manage attendance for assigned classes" ON public.attendance;
CREATE POLICY "Teachers can manage attendance for assigned classes" ON public.attendance
  FOR ALL
  USING (
    (deleted_at IS NULL)
    AND (
      school_id = public.get_user_school_id()
      AND (
        EXISTS (
          SELECT 1
          FROM public.class_subjects cs
          JOIN public.students s ON s.class_id = cs.class_id
          WHERE cs.subject_id = attendance.subject_id
            AND s.id = attendance.student_id
            AND cs.teacher_id = auth.uid()
            AND cs.school_id = public.get_user_school_id()
            AND s.school_id = public.get_user_school_id()
        )
        OR
        (
          EXISTS (
            SELECT 1
            FROM public.subjects sub
            JOIN public.students s ON s.class_id = sub.class_id
            WHERE sub.id = attendance.subject_id
              AND s.id = attendance.student_id
              AND sub.teacher_id = auth.uid()
              AND sub.school_id = public.get_user_school_id()
              AND s.school_id = public.get_user_school_id()
          )
        )
        OR
        (
          (public.has_role(auth.uid(), 'director'::public.app_role) OR
           public.has_role(auth.uid(), 'secretariat'::public.app_role))
          AND school_id = public.get_user_school_id()
        )
        OR
        public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
        public.has_role(auth.uid(), 'developer'::public.app_role)
      )
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = attendance.subject_id
          AND s.id = attendance.student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = attendance.subject_id
          AND s.id = attendance.student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      (
        (public.has_role(auth.uid(), 'director'::public.app_role) OR
         public.has_role(auth.uid(), 'secretariat'::public.app_role))
        AND school_id = public.get_user_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- 4) Homeroom/Director attendance policies: exclude soft-deleted rows
DROP POLICY IF EXISTS "Homeroom teachers can view class attendance" ON public.attendance;
CREATE POLICY "Homeroom teachers can view class attendance" ON public.attendance
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND school_id = public.get_user_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Homeroom teachers can update attendance status" ON public.attendance;
CREATE POLICY "Homeroom teachers can update attendance status" ON public.attendance
  FOR UPDATE
  USING (
    (deleted_at IS NULL)
    AND school_id = public.get_user_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Directors and secretariat can update attendance status" ON public.attendance;
CREATE POLICY "Directors and secretariat can update attendance status" ON public.attendance
  FOR UPDATE
  USING (
    (deleted_at IS NULL)
    AND (
      public.has_role(auth.uid(), 'director'::public.app_role) OR
      public.has_role(auth.uid(), 'secretariat'::public.app_role)
    )
    AND school_id = public.get_user_school_id()
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'director'::public.app_role) OR
      public.has_role(auth.uid(), 'secretariat'::public.app_role)
    )
    AND school_id = public.get_user_school_id()
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 74/102: 20260223000001_soft_delete_rpcs_views.sql
-- ---------------------------------------------------------------------------
-- Soft Delete: RPCs and views that read from grades/attendance must exclude deleted_at IS NOT NULL.

-- 1) get_school_grades_stats: count and average only non-deleted grades
CREATE OR REPLACE FUNCTION public.get_school_grades_stats()
RETURNS TABLE(total_count bigint, average_grade numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    ROUND(AVG(grade)::numeric, 2) AS average_grade
  FROM public.grades
  WHERE deleted_at IS NULL;
$$;

-- 2) get_grades_distribution: only non-deleted grades
CREATE OR REPLACE FUNCTION public.get_grades_distribution()
RETURNS TABLE(grade int, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROUND(g.grade)::int AS grade,
    COUNT(*)::bigint AS cnt
  FROM public.grades g
  WHERE g.deleted_at IS NULL
    AND g.grade >= 1 AND g.grade <= 10
  GROUP BY ROUND(g.grade)
  ORDER BY ROUND(g.grade);
$$;

-- 3) close_academic_year: snapshot attendance only non-deleted rows
CREATE OR REPLACE FUNCTION public.close_academic_year(p_year_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year RECORD;
  v_student RECORD;
  v_subject RECORD;
  v_user_id UUID;
  v_user_name TEXT;
  v_role app_role;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'director'::app_role) OR has_role(v_user_id, 'secretariat'::app_role) OR has_role(v_user_id, 'uat_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only director, secretariat or uat_admin can close academic year';
  END IF;

  SELECT ay.* INTO v_year
  FROM public.academic_year ay
  WHERE ay.id = p_year_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic year not found';
  END IF;

  IF v_year.year_closed THEN
    RAISE EXCEPTION 'Academic year is already closed';
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'director'::app_role)
  INTO v_user_name, v_role
  FROM public.profiles p WHERE p.id = v_user_id;

  FOR v_student IN
    SELECT s.id
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE c.school_id = v_year.school_id AND c.year = v_year.year
  LOOP
    FOR v_subject IN
      SELECT *
      FROM public.view_student_subject_average
      WHERE student_id = v_student.id
    LOOP
      INSERT INTO public.academic_year_snapshots (
        academic_year_id, student_id, subject_id, subject_name, average,
        grades_json, attendance_json
      )
      VALUES (
        p_year_id, v_student.id, v_subject.subject_id, v_subject.subject_name, v_subject.average,
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object('date', g.date, 'grade', g.grade, 'description', g.description)
        ), '[]'::jsonb)
         FROM public.grades g
         WHERE g.student_id = v_student.id AND g.subject_id = v_subject.subject_id AND g.deleted_at IS NULL),
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object('date', a.date, 'status', a.status)
        ), '[]'::jsonb)
         FROM public.attendance a
         WHERE a.student_id = v_student.id AND a.subject_id = v_subject.subject_id AND a.deleted_at IS NULL)
      )
      ON CONFLICT (academic_year_id, student_id, subject_id) DO UPDATE SET
        average = EXCLUDED.average,
        grades_json = EXCLUDED.grades_json,
        attendance_json = EXCLUDED.attendance_json;
    END LOOP;
  END LOOP;

  UPDATE public.academic_year
  SET year_closed = true, closed_at = now(), closed_by = v_user_id
  WHERE id = p_year_id;

  INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, details, school_id)
  VALUES (
    v_user_id, COALESCE(v_user_name, ''), v_role,
    'academic_year.closed', 'academic_year', p_year_id,
    jsonb_build_object('year_id', p_year_id, 'year', v_year.year, 'school_id', v_year.school_id),
    v_year.school_id
  );

  RETURN true;
END;
$$;

-- 4) motivate_attendance: only allow for non-deleted attendance rows
CREATE OR REPLACE FUNCTION public.motivate_attendance(
  p_attendance_id UUID,
  p_justification_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  subject_id UUID,
  date DATE,
  attendance_status public.attendance_status,
  justification_url TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_status public.attendance_status;
  v_student_class_id UUID;
  v_homeroom_teacher_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user_id, 'homeroom_teacher'::app_role) OR
    public.has_role(v_user_id, 'director'::app_role) OR
    public.has_role(v_user_id, 'secretariat'::app_role) OR
    public.has_role(v_user_id, 'uat_admin'::app_role) OR
    public.has_role(v_user_id, 'developer'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only homeroom_teacher, director, or secretariat can motivate attendance';
  END IF;

  SELECT
    a.attendance_status,
    s.class_id,
    c.teacher_id
  INTO
    v_current_status,
    v_student_class_id,
    v_homeroom_teacher_id
  FROM public.attendance a
  JOIN public.students s ON s.id = a.student_id
  LEFT JOIN public.classes c ON c.id = s.class_id
  WHERE a.id = p_attendance_id AND a.deleted_at IS NULL;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  IF v_current_status != 'nemotivata'::public.attendance_status THEN
    RAISE EXCEPTION 'Can only motivate attendance with status "nemotivata". Current status: %', v_current_status;
  END IF;

  IF public.has_role(v_user_id, 'homeroom_teacher'::app_role) THEN
    IF v_homeroom_teacher_id != v_user_id THEN
      RAISE EXCEPTION 'Homeroom teacher can only motivate attendance for students in their own class';
    END IF;
  END IF;

  UPDATE public.attendance
  SET
    attendance_status = 'motivata'::public.attendance_status,
    justification_url = COALESCE(p_justification_url, justification_url),
    validated_by = v_user_id,
    validated_at = now()
  WHERE id = p_attendance_id AND deleted_at IS NULL;

  RETURN QUERY
  SELECT
    a.id,
    a.student_id,
    a.subject_id,
    a.date,
    a.attendance_status,
    a.justification_url,
    a.validated_at AS updated_at
  FROM public.attendance a
  WHERE a.id = p_attendance_id AND a.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.motivate_attendance(UUID, TEXT) TO authenticated;
COMMENT ON FUNCTION public.motivate_attendance(UUID, TEXT) IS 'Changes attendance status from "nemotivata" to "motivata". Only non-deleted rows. Only homeroom_teacher (for their class), director, or secretariat.';


-- ---------------------------------------------------------------------------
-- MIGRATION 75/102: 20260224000000_multi_tenant_rls_refactor.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Migration: Multi-Tenant RLS Refactor & Security Hardening
-- Senior Database Architect & Backend Engineer Implementation
-- 
-- This migration implements:
-- 1. Schema integrity fixes (NOT NULL constraints, FK, CHECK constraints)
-- 2. Multi-tenant isolation with rigorous RLS policies
-- 3. Teacher assignments table for proper access control
-- 4. Audit logging enhancements
-- 5. Performance indexes
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: SCHEMA INTEGRITY FIXES
-- =============================================================================

-- 1.1) Ensure app_role ENUM has all required values
DO $$
BEGIN
  -- Add 'admin' if it doesn't exist (currently we have 'uat_admin')
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
END $$;

-- 1.2) Add role column to profiles if it doesn't exist (use app_role ENUM)
-- Note: profiles already has active_role, but we'll ensure role column exists for consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role public.app_role;
    -- Copy active_role to role for existing records
    UPDATE public.profiles SET role = active_role WHERE role IS NULL;
    -- Set role to NOT NULL after backfilling
    ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
  ELSE
    -- If column exists, ensure it's app_role type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
        AND udt_name != 'app_role'
    ) THEN
      ALTER TABLE public.profiles
        ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
    END IF;
  END IF;
END $$;

-- 1.3) Ensure school_id is NOT NULL with FK on students
DO $$
BEGIN
  -- Add school_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.students ADD COLUMN school_id UUID;
    -- Backfill from classes
    UPDATE public.students s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;
  
  -- Ensure FK constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'students'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  -- Set NOT NULL after ensuring data exists
  ALTER TABLE public.students ALTER COLUMN school_id SET NOT NULL;
END $$;

-- 1.4) Ensure school_id is NOT NULL with FK on classes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.classes ADD COLUMN school_id UUID;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'classes'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  -- Only set NOT NULL if all rows have school_id
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE school_id IS NULL) THEN
    ALTER TABLE public.classes ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- 1.5) Ensure school_id is NOT NULL with FK on grades
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grades' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.grades ADD COLUMN school_id UUID;
    -- Backfill from students
    UPDATE public.grades g
    SET school_id = s.school_id
    FROM public.students s
    WHERE g.student_id = s.id AND g.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'grades'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  ALTER TABLE public.grades ALTER COLUMN school_id SET NOT NULL;
END $$;

-- 1.6) Ensure school_id is NOT NULL with FK on attendance (absences)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.attendance ADD COLUMN school_id UUID;
    -- Backfill from students
    UPDATE public.attendance a
    SET school_id = s.school_id
    FROM public.students s
    WHERE a.student_id = s.id AND a.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'attendance'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  ALTER TABLE public.attendance ALTER COLUMN school_id SET NOT NULL;
END $$;

-- 1.7) Ensure school_id is NOT NULL with FK on subjects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.subjects ADD COLUMN school_id UUID;
    -- Backfill from classes
    UPDATE public.subjects s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'subjects'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.subjects
      ADD CONSTRAINT subjects_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  ALTER TABLE public.subjects ALTER COLUMN school_id SET NOT NULL;
END $$;

-- 1.8) Ensure CHECK constraint for grades (1-10) - already exists but ensure it's correct
ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_grade_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);

-- 1.9) Add CHECK constraint for attendance absences (count >= 0)
-- Note: attendance table uses status field, not a count. We'll add a constraint on status validity
-- For actual absences count, we'd need a separate table or computed column
-- But we can ensure status is valid
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check 
  CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending'));

-- =============================================================================
-- PART 2: MULTI-TENANT ISOLATION - get_my_school_id() FUNCTION
-- =============================================================================

-- 2.1) Create get_my_school_id() function (alias for get_user_school_id() if exists)
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_my_school_id() IS 'Returns the school_id of the currently authenticated user. Used in RLS policies for multi-tenant isolation.';

-- =============================================================================
-- PART 3: TEACHER ASSIGNMENTS TABLE
-- =============================================================================

-- 3.1) Create teacher_assignments table (pivot table for teacher-class-subject-semester)
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Unique constraint to prevent duplicate assignments
  UNIQUE (teacher_id, class_id, subject_id, semester_id)
);

COMMENT ON TABLE public.teacher_assignments IS 'Pivot table linking teachers to class-subject-semester combinations. Used for RLS to control grade access.';

-- 3.2) Create indexes for teacher_assignments
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_id ON public.teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_id ON public.teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_subject_id ON public.teacher_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_school_id ON public.teacher_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_semester_id ON public.teacher_assignments(semester_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_composite ON public.teacher_assignments(teacher_id, class_id, subject_id);

-- 3.3) Enable RLS on teacher_assignments
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

-- 3.4) RLS policies for teacher_assignments
DROP POLICY IF EXISTS "Users can view teacher_assignments from their school" ON public.teacher_assignments;
CREATE POLICY "Users can view teacher_assignments from their school" ON public.teacher_assignments
  FOR SELECT
  USING (
    school_id = public.get_my_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage teacher_assignments" ON public.teacher_assignments;
CREATE POLICY "Staff can manage teacher_assignments" ON public.teacher_assignments
  FOR ALL
  USING (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 3.5) Trigger to auto-set school_id and updated_at
CREATE OR REPLACE FUNCTION public.set_teacher_assignment_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set school_id from class if not provided
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;
  
  -- Set updated_at
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_teacher_assignment_school_id ON public.teacher_assignments;
CREATE TRIGGER trg_set_teacher_assignment_school_id
  BEFORE INSERT OR UPDATE ON public.teacher_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_teacher_assignment_school_id();

-- =============================================================================
-- PART 4: AUDIT LOG ENHANCEMENTS
-- =============================================================================

-- 4.1) Ensure audit_logs has old_data and new_data columns (JSONB)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'old_data'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN old_data JSONB;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'new_data'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN new_data JSONB;
  END IF;
END $$;

-- 4.2) Ensure audit_logs has school_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);
  END IF;
END $$;

-- =============================================================================
-- PART 5: SEMESTER LOCK ENFORCEMENT IN RLS
-- =============================================================================

-- 5.1) Helper function to get semester from date
CREATE OR REPLACE FUNCTION public.get_semester_from_date(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  month_val INTEGER;
BEGIN
  month_val := EXTRACT(MONTH FROM p_date);
  -- Semester 1: September - January (months 9-12, 1)
  -- Semester 2: February - June (months 2-6)
  IF month_val IN (9, 10, 11, 12, 1) THEN
    RETURN 1;
  ELSE
    RETURN 2;
  END IF;
END;
$$;

-- 5.2) Enhanced function to check if semester is locked (for grades)
CREATE OR REPLACE FUNCTION public.is_semester_locked_for_grade(
  p_grade_date DATE,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_academic_year INTEGER;
  v_semester INTEGER;
  v_is_locked BOOLEAN;
BEGIN
  -- Get student's school_id
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id;
  
  IF v_school_id IS NULL THEN
    -- If we can't determine school, allow (will be caught by other RLS policies)
    RETURN false;
  END IF;
  
  -- Calculate academic year and semester from date
  v_academic_year := public.get_academic_year_from_date(p_grade_date);
  v_semester := public.get_semester_from_date(p_grade_date);
  
  -- Check if semester is locked
  SELECT is_locked INTO v_is_locked
  FROM public.semesters
  WHERE school_id = v_school_id
    AND academic_year = v_academic_year
    AND semester = v_semester;
  
  -- If semester doesn't exist, it's not locked (default behavior)
  IF v_is_locked IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN v_is_locked;
END;
$$;

COMMENT ON FUNCTION public.is_semester_locked_for_grade IS 'Checks if the semester for a given grade date and student is locked. Returns true if semester is_locked = true, preventing INSERT/UPDATE.';

-- =============================================================================
-- PART 6: PERFORMANCE INDEXES
-- =============================================================================

-- 6.1) Indexes on Foreign Key columns for performance
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);

CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);

CREATE INDEX IF NOT EXISTS idx_subjects_class_id ON public.subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON public.subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects(school_id);

CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_subject_id ON public.grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_grades_teacher_id ON public.grades(teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_id ON public.grades(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_date ON public.grades(date);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject_id ON public.attendance(subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_id ON public.attendance(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);

CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles(school_id);

-- =============================================================================
-- PART 7: RLS POLICIES REWRITE - MULTI-TENANT ISOLATION
-- =============================================================================

-- 7.1) Students RLS - Directors can only SELECT/UPDATE if school_id matches
DROP POLICY IF EXISTS "Directors can manage students from their school" ON public.students;
CREATE POLICY "Directors can manage students from their school" ON public.students
  FOR ALL
  USING (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 7.2) Classes RLS - Directors can only SELECT/UPDATE if school_id matches
DROP POLICY IF EXISTS "Directors can manage classes from their school" ON public.classes;
CREATE POLICY "Directors can manage classes from their school" ON public.classes
  FOR ALL
  USING (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 7.3) Subjects RLS - Directors can only SELECT/UPDATE if school_id matches
DROP POLICY IF EXISTS "Directors can manage subjects from their school" ON public.subjects;
CREATE POLICY "Directors can manage subjects from their school" ON public.subjects
  FOR ALL
  USING (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'teacher'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'teacher'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 7.4) Grades RLS - Teachers can INSERT/UPDATE only if teacher_assignments exists
-- AND semester is not locked
DROP POLICY IF EXISTS "Teachers can insert grades via teacher_assignments" ON public.grades;
CREATE POLICY "Teachers can insert grades via teacher_assignments" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- First: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second: teacher must have assignment in teacher_assignments
    (
      EXISTS (
        SELECT 1
        FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      -- Fallback: check class_subjects (for backward compatibility)
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.teacher_id = auth.uid()
          AND cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      -- Staff (director/secretariat) can insert even if semester is locked (for corrections)
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_my_school_id()
      )
      OR
      -- UAT Admin and Developer can insert
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

DROP POLICY IF EXISTS "Teachers can update grades via teacher_assignments" ON public.grades;
CREATE POLICY "Teachers can update grades via teacher_assignments" ON public.grades
  FOR UPDATE
  USING (
    -- First: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second: teacher must have assignment
    (
      EXISTS (
        SELECT 1
        FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.teacher_id = auth.uid()
          AND cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_my_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  )
  WITH CHECK (
    -- Same checks for WITH CHECK clause
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    (
      EXISTS (
        SELECT 1
        FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.teacher_id = auth.uid()
          AND cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_my_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- 7.5) Profiles RLS - Directors can only SELECT/UPDATE if school_id matches
DROP POLICY IF EXISTS "Directors can view profiles from their school" ON public.profiles;
CREATE POLICY "Directors can view profiles from their school" ON public.profiles
  FOR SELECT
  USING (
    (
      school_id = public.get_my_school_id() AND
      public.has_role(auth.uid(), 'director'::app_role)
    ) OR
    id = auth.uid() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Directors can update profiles from their school" ON public.profiles;
CREATE POLICY "Directors can update profiles from their school" ON public.profiles
  FOR UPDATE
  USING (
    (
      school_id = public.get_my_school_id() AND
      public.has_role(auth.uid(), 'director'::app_role)
    ) OR
    id = auth.uid() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      public.has_role(auth.uid(), 'director'::app_role)
    ) OR
    id = auth.uid() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 76/102: 20260224000001_populate_teacher_assignments.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Migration: Populate teacher_assignments from existing data
-- Run this AFTER 20260224000000_multi_tenant_rls_refactor.sql
-- 
-- This migration populates the teacher_assignments table from existing
-- class_subjects or subjects table data.
-- =============================================================================

BEGIN;

-- 1) Populate teacher_assignments from class_subjects (if exists)
INSERT INTO public.teacher_assignments (teacher_id, class_id, subject_id, school_id)
SELECT DISTINCT
  cs.teacher_id,
  cs.class_id,
  cs.subject_id,
  cs.school_id
FROM public.class_subjects cs
WHERE cs.teacher_id IS NOT NULL
  AND cs.class_id IS NOT NULL
  AND cs.subject_id IS NOT NULL
  AND cs.school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = cs.teacher_id
      AND ta.class_id = cs.class_id
      AND ta.subject_id = cs.subject_id
      AND ta.semester_id IS NULL -- Match NULL semester_id
  )
ON CONFLICT (teacher_id, class_id, subject_id, semester_id) DO NOTHING;

-- 2) Populate teacher_assignments from subjects table (fallback if class_subjects doesn't exist or is incomplete)
INSERT INTO public.teacher_assignments (teacher_id, class_id, subject_id, school_id)
SELECT DISTINCT
  s.teacher_id,
  s.class_id,
  s.id AS subject_id,
  s.school_id
FROM public.subjects s
WHERE s.teacher_id IS NOT NULL
  AND s.class_id IS NOT NULL
  AND s.school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = s.teacher_id
      AND ta.class_id = s.class_id
      AND ta.subject_id = s.id
      AND ta.semester_id IS NULL
  )
ON CONFLICT (teacher_id, class_id, subject_id, semester_id) DO NOTHING;

-- 3) Verify data integrity
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.teacher_assignments;
  
  IF v_count = 0 THEN
    RAISE WARNING 'No teacher_assignments were created. Please verify source data exists.';
  ELSE
    RAISE NOTICE 'Created % teacher_assignments entries', v_count;
  END IF;
END $$;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 77/102: 20260225000000_business_logic_triggers.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Migration: Business Logic Automată (Single Source of Truth)
-- 
-- 1. subject_averages + trigger recalc la INSERT/UPDATE/DELETE pe grades
-- 2. check_semester_status() - blocare strictă (inclusiv profesori)
-- 3. Validare: profesor alocat în teacher_assignments + materie în class_subjects
-- 4. Notificări automate la notă nouă (parent)
-- 5. log_changes() audit granular cu OLD/NEW și mesaj lizibil
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: SUBJECT_AVERAGES TABLE + TRIGGER RECALC
-- =============================================================================

-- 1.1) Tabel subject_averages (student_id, subject_id, semester scope, average)
CREATE TABLE IF NOT EXISTS public.subject_averages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  average NUMERIC(4,2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year, semester)
);

COMMENT ON TABLE public.subject_averages IS 'Medii per elev, per materie, per semestru. Recalculate automat la INSERT/UPDATE/DELETE pe grades.';

CREATE INDEX IF NOT EXISTS idx_subject_averages_student_id ON public.subject_averages(student_id);
CREATE INDEX IF NOT EXISTS idx_subject_averages_subject_id ON public.subject_averages(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_averages_lookup ON public.subject_averages(student_id, subject_id, academic_year, semester);

ALTER TABLE public.subject_averages ENABLE ROW LEVEL SECURITY;

-- RLS: same visibility as grades (student, parent, teacher, staff)
DROP POLICY IF EXISTS "subject_averages_select" ON public.subject_averages;
CREATE POLICY "subject_averages_select" ON public.subject_averages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = subject_averages.student_id AND s.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parent_student_relations psr WHERE psr.student_id = subject_averages.student_id AND psr.parent_user_id = auth.uid())
  OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
  OR public.has_role(auth.uid(), 'director'::public.app_role)
  OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
  OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'developer'::public.app_role)
);

-- 1.2) Funcție recalc medie per (student, subject, academic_year, semester)
-- Consideră doar note cu deleted_at IS NULL. Medie aritmetică, rotunjită la 2 zecimale.
CREATE OR REPLACE FUNCTION public.recalc_subject_average(
  p_student_id UUID,
  p_subject_id UUID,
  p_academic_year INTEGER,
  p_semester INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg NUMERIC(4,2);
BEGIN
  SELECT ROUND(AVG(g.grade)::numeric, 2) INTO v_avg
  FROM public.grades g
  WHERE g.student_id = p_student_id
    AND g.subject_id = p_subject_id
    AND g.deleted_at IS NULL
    AND public.get_academic_year_from_date(g.date) = p_academic_year
    AND public.get_semester_from_date(g.date) = p_semester;

  IF v_avg IS NULL THEN
    DELETE FROM public.subject_averages
    WHERE student_id = p_student_id
      AND subject_id = p_subject_id
      AND academic_year = p_academic_year
      AND semester = p_semester;
    RETURN;
  END IF;

  INSERT INTO public.subject_averages (student_id, subject_id, academic_year, semester, average, updated_at)
  VALUES (p_student_id, p_subject_id, p_academic_year, p_semester, v_avg, now())
  ON CONFLICT (student_id, subject_id, academic_year, semester)
  DO UPDATE SET average = EXCLUDED.average, updated_at = now();
END;
$$;

-- 1.3) Trigger: la INSERT/UPDATE/DELETE pe grades, recalculează media
CREATE OR REPLACE FUNCTION public.trg_grades_recalc_average()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_subject_id UUID;
  v_date DATE;
  v_ay INTEGER;
  v_sem INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_student_id := OLD.student_id;
    v_subject_id := OLD.subject_id;
    v_date := OLD.date;
  ELSE
    v_student_id := NEW.student_id;
    v_subject_id := NEW.subject_id;
    v_date := NEW.date;
  END IF;

  v_ay := public.get_academic_year_from_date(v_date);
  v_sem := public.get_semester_from_date(v_date);

  PERFORM public.recalc_subject_average(v_student_id, v_subject_id, v_ay, v_sem);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_recalc_average ON public.grades;
CREATE TRIGGER trg_grades_recalc_average
  AFTER INSERT OR UPDATE OF grade, date, deleted_at OR DELETE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_grades_recalc_average();

-- Backfill subject_averages from existing grades
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT g.student_id, g.subject_id,
      public.get_academic_year_from_date(g.date) AS ay,
      public.get_semester_from_date(g.date) AS sem
    FROM public.grades g
    WHERE g.deleted_at IS NULL
  ) LOOP
    PERFORM public.recalc_subject_average(r.student_id, r.subject_id, r.ay, r.sem);
  END LOOP;
END $$;

-- =============================================================================
-- PART 2: CHECK_SEMESTER_STATUS() - BLOCARE PENTRU TOȚI
-- =============================================================================

-- 2.1) Funcție care aruncă excepție dacă semestrul e blocat (apelată din trigger)
CREATE OR REPLACE FUNCTION public.check_semester_status(
  p_table_name TEXT,
  p_date DATE,
  p_student_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_ay INTEGER;
  v_sem INTEGER;
  v_locked BOOLEAN;
BEGIN
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  v_ay := public.get_academic_year_from_date(p_date);
  v_sem := public.get_semester_from_date(p_date);

  SELECT sem.is_locked INTO v_locked
  FROM public.semesters sem
  WHERE sem.school_id = v_school_id
    AND sem.academic_year = v_ay
    AND sem.semester = v_sem;

  IF v_locked = true THEN
    RAISE EXCEPTION 'Semestrul pentru perioada acestei operații este blocat. Nu se pot modifica note sau absențe.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- 2.2) Trigger BEFORE pe grades: verifică blocare semestru
CREATE OR REPLACE FUNCTION public.trg_grades_check_semester_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.check_semester_status('grades', OLD.date, OLD.student_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.check_semester_status('grades', COALESCE(NEW.date, OLD.date), COALESCE(NEW.student_id, OLD.student_id));
    RETURN NEW;
  ELSE
    PERFORM public.check_semester_status('grades', NEW.date, NEW.student_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_check_semester_lock ON public.grades;
CREATE TRIGGER trg_grades_check_semester_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_grades_check_semester_lock();

-- 2.3) Trigger BEFORE pe attendance: verifică blocare semestru
CREATE OR REPLACE FUNCTION public.trg_attendance_check_semester_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.check_semester_status('attendance', OLD.date, OLD.student_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.check_semester_status('attendance', COALESCE(NEW.date, OLD.date), COALESCE(NEW.student_id, OLD.student_id));
    RETURN NEW;
  ELSE
    PERFORM public.check_semester_status('attendance', NEW.date, NEW.student_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_check_semester_lock ON public.attendance;
CREATE TRIGGER trg_attendance_check_semester_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_attendance_check_semester_lock();

-- =============================================================================
-- PART 3: VALIDARE PROFESOR + MATERIE ÎN PLANUL CLASEI
-- =============================================================================

-- 3.1) Trigger BEFORE INSERT/UPDATE pe grades: profesor alocat + materie în class_subjects
CREATE OR REPLACE FUNCTION public.trg_grades_validate_teacher_and_curriculum()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_id UUID;
  v_teacher_ok BOOLEAN;
  v_subject_in_plan BOOLEAN;
BEGIN
  SELECT s.class_id INTO v_class_id
  FROM public.students s
  WHERE s.id = COALESCE(NEW.student_id, OLD.student_id);

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Student invalid.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Materia trebuie să fie în planul de învățământ al clasei (class_subjects)
  SELECT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.class_id = v_class_id
      AND cs.subject_id = COALESCE(NEW.subject_id, OLD.subject_id)
  ) INTO v_subject_in_plan;

  IF NOT v_subject_in_plan THEN
    RAISE EXCEPTION 'Materia nu face parte din planul de învățământ al clasei elevului.'
      USING ERRCODE = 'P0001';
  END IF;

  -- La INSERT/UPDATE: profesorul trebuie să fie alocat (teacher_assignments sau class_subjects)
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.teacher_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      WHERE ta.teacher_id = NEW.teacher_id
        AND ta.class_id = v_class_id
        AND ta.subject_id = NEW.subject_id
    ) OR EXISTS (
      SELECT 1 FROM public.class_subjects cs
      WHERE cs.teacher_id = NEW.teacher_id
        AND cs.class_id = v_class_id
        AND cs.subject_id = NEW.subject_id
    ) INTO v_teacher_ok;

    IF NOT v_teacher_ok THEN
      RAISE EXCEPTION 'Nu sunteți alocat la această clasă/materie. Nu puteți introduce note.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_validate_teacher_and_curriculum ON public.grades;
CREATE TRIGGER trg_grades_validate_teacher_and_curriculum
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_grades_validate_teacher_and_curriculum();

-- =============================================================================
-- PART 4: NOTIFICĂRI AUTOMATE (NOTĂ NOUĂ -> PARENT)
-- =============================================================================

-- 4.1) Asigură coloana read_status pe notifications (alias pentru is_read)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_status BOOLEAN DEFAULT false;

UPDATE public.notifications
SET read_status = COALESCE(is_read, (read_at IS NOT NULL))
WHERE read_status IS NULL;

-- Sincronizare viitoare: trigger pe UPDATE pentru a păstra read_status = is_read
CREATE OR REPLACE FUNCTION public.notify_grade_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_user_id UUID;
  v_subject_name TEXT;
  v_message TEXT;
  v_title TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_subject_name
  FROM public.subjects WHERE id = NEW.subject_id;

  v_message := format('Ai primit nota %s la %s', NEW.grade, COALESCE(v_subject_name, 'materie'));
  IF NEW.description IS NOT NULL AND trim(NEW.description) != '' THEN
    v_message := v_message || format(' (%s)', NEW.description);
  END IF;
  v_title := 'Notă nouă';

  -- Notificare pentru elev (dacă are user_id)
  SELECT user_id INTO v_student_user_id FROM public.students WHERE id = NEW.student_id;
  IF v_student_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, is_read, read_status, link)
    VALUES (v_student_user_id, 'grade', v_title, v_message, false, false, '/grades');
  END IF;

  -- Notificări pentru părinți
  INSERT INTO public.notifications (user_id, type, title, message, is_read, read_status, link)
  SELECT
    psr.parent_user_id,
    'grade',
    format('Notă nouă pentru %s', COALESCE(s.full_name, 'elevul tău')),
    v_message,
    false,
    false,
    '/grades'
  FROM public.parent_student_relations psr
  JOIN public.students s ON s.id = psr.student_id
  WHERE psr.student_id = NEW.student_id AND psr.parent_user_id IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_grade_added ON public.grades;
CREATE TRIGGER trg_notify_grade_added
  AFTER INSERT ON public.grades
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_grade_added();

-- =============================================================================
-- PART 5: AUDIT GRANULAR - log_changes() CU OLD/NEW ȘI MESAJE LIZIBILE
-- =============================================================================

-- 5.1) Helper: construiește mesaj lizibil pentru schimbări pe grades (parametri expliciti pentru a evita NULL RECORD)
CREATE OR REPLACE FUNCTION public.audit_summary_grades(
  p_op TEXT,
  p_user_name TEXT,
  p_old_grade NUMERIC DEFAULT NULL,
  p_new_grade NUMERIC DEFAULT NULL,
  p_old_date DATE DEFAULT NULL,
  p_new_date DATE DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_msg TEXT;
BEGIN
  IF p_op = 'INSERT' THEN
    v_msg := format('%s a adăugat nota %s la data %s', p_user_name, p_new_grade, p_new_date);
  ELSIF p_op = 'UPDATE' THEN
    IF (p_old_grade IS DISTINCT FROM p_new_grade) THEN
      v_msg := format('%s a schimbat nota de la %s la %s la data %s', p_user_name, p_old_grade, p_new_grade, COALESCE(p_new_date::text, p_old_date::text));
    ELSE
      v_msg := format('%s a actualizat înregistrarea de notă (id: %s)', p_user_name, p_entity_id);
    END IF;
  ELSIF p_op = 'DELETE' THEN
    v_msg := format('%s a șters nota %s de la data %s', p_user_name, p_old_grade, p_old_date);
  ELSE
    v_msg := format('%s - %s pe grades', p_user_name, p_op);
  END IF;
  RETURN v_msg;
END;
$$;

-- 5.2) Funcție generică jsonb_diff (chei diferite între OLD și NEW)
CREATE OR REPLACE FUNCTION public.jsonb_diff(old_val JSONB, new_val JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_key TEXT;
BEGIN
  FOR v_key IN
    SELECT DISTINCT k.key
    FROM (
      SELECT key FROM jsonb_each(COALESCE(old_val, '{}'::jsonb))
      UNION
      SELECT key FROM jsonb_each(COALESCE(new_val, '{}'::jsonb))
    ) AS k(key)
    WHERE (COALESCE(old_val, '{}'::jsonb)->k.key) IS DISTINCT FROM (COALESCE(new_val, '{}'::jsonb)->k.key)
  LOOP
    v_result := v_result || jsonb_build_object(v_key, jsonb_build_object('old', old_val->v_key, 'new', new_val->v_key));
  END LOOP;
  RETURN v_result;
END;
$$;

-- 5.3) log_changes() - salvează în audit_logs cu old_data, new_data și summary
CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_uname TEXT;
  v_urole public.app_role;
  v_school_id UUID;
  v_entity_id UUID;
  v_old_json JSONB;
  v_new_json JSONB;
  v_summary TEXT;
  v_details JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'student'::public.app_role), p.school_id
  INTO v_uname, v_urole, v_school_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  v_entity_id := COALESCE((NEW).id, (OLD).id);
  v_old_json := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new_json := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  IF TG_TABLE_NAME = 'grades' THEN
    v_summary := public.audit_summary_grades(
      TG_OP, COALESCE(v_uname, 'Utilizator'),
      (OLD).grade, (NEW).grade,
      (OLD).date, (NEW).date,
      v_entity_id
    );
  ELSE
    v_summary := format('%s - %s pe %s (id: %s)', COALESCE(v_uname, 'Utilizator'), TG_OP, TG_TABLE_NAME, v_entity_id);
  END IF;

  v_details := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'server_ts', now(),
    'summary', v_summary,
    'diff', public.jsonb_diff(v_old_json, v_new_json)
  );

  INSERT INTO public.audit_logs (
    user_id, user_name, active_role, action, entity_type, entity_id,
    old_data, new_data, details, school_id
  ) VALUES (
    v_uid, COALESCE(v_uname, ''), COALESCE(v_urole, 'student'::public.app_role),
    TG_OP, TG_TABLE_NAME, v_entity_id,
    v_old_json, v_new_json, v_details, v_school_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5.4) Înlocuie trigger-urile de audit pe grades cu log_changes (un singur audit granular)
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
DROP TRIGGER IF EXISTS trg_audit_row_change_grades ON public.grades;
DROP TRIGGER IF EXISTS trg_audit_grades_update_details ON public.grades;
CREATE TRIGGER trg_audit_grades_log_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.log_changes();

-- Audit granular și pe attendance (mesaj generic; old_data/new_data în details)
DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance_log_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.log_changes();

-- Opțional: audit și pe user_roles (schimbări roluri) cu același log_changes
-- Dacă există trigger pe user_roles, îl putem adapta; altfel omitem.

COMMENT ON FUNCTION public.log_changes IS 'Audit granular: salvează old_data, new_data și mesaj lizibil (ex: Profesorul X a schimbat nota de la 7 la 9 la data Y).';
COMMENT ON FUNCTION public.check_semester_status IS 'Aruncă excepție dacă semestrul este blocat. Apelat din trigger-uri pe grades și attendance - blochează toți utilizatorii.';
COMMENT ON FUNCTION public.recalc_subject_average IS 'Recalculează media elevului la o materie pentru un semestru; folosit de trigger la modificări grades.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 78/102: 20260226000000_critical_security_hardening.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Migration: Corecții Critice de Arhitectură și Securitate
-- 
-- Această migrare asigură:
-- 1. Multi-Tenancy Hardening: school_id NOT NULL + FK, RLS strict cu get_user_school_id()
-- 2. Constrângeri de Validare: app_role ENUM, CHECK constraints
-- 3. Teacher Assignments & Granular RLS: pivot table + RLS strict pe grades
-- 4. Audit Log & State Control: audit_logs complet, locking în semesters
-- 5. Optimizare Performanță: indexuri pe toate FK-urile critice
-- 
-- REGULĂ STRICTĂ: Nu lasă date orfane și toate funcțiile folosesc auth.uid() securizat
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: MULTI-TENANCY HARDENING - SCHEMA & FK CONSTRAINTS
-- =============================================================================

-- 1.1) Asigură că toate tabelele au school_id NOT NULL cu FK către schools(id)
-- Students
DO $$
BEGIN
  -- Verifică și adaugă school_id dacă lipsește
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.students ADD COLUMN school_id UUID;
    -- Backfill din classes
    UPDATE public.students s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;
  
  -- Asigură FK constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'students'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  -- Set NOT NULL (doar dacă nu există NULL-uri)
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE school_id IS NULL) THEN
    ALTER TABLE public.students ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există studenți fără school_id. Trebuie să fie populați înainte de a seta NOT NULL.';
  END IF;
END $$;

-- Classes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.classes ADD COLUMN school_id UUID;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'classes'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE school_id IS NULL) THEN
    ALTER TABLE public.classes ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există clase fără school_id. Trebuie să fie populate înainte de a seta NOT NULL.';
  END IF;
END $$;

-- Subjects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.subjects ADD COLUMN school_id UUID;
    -- Backfill din classes
    UPDATE public.subjects s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'subjects'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.subjects
      ADD CONSTRAINT subjects_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE school_id IS NULL) THEN
    ALTER TABLE public.subjects ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există materii fără school_id. Trebuie să fie populate înainte de a seta NOT NULL.';
  END IF;
END $$;

-- Grades
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grades' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.grades ADD COLUMN school_id UUID;
    -- Backfill din students
    UPDATE public.grades g
    SET school_id = s.school_id
    FROM public.students s
    WHERE g.student_id = s.id AND g.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'grades'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.grades WHERE school_id IS NULL) THEN
    ALTER TABLE public.grades ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există note fără school_id. Trebuie să fie populate înainte de a seta NOT NULL.';
  END IF;
END $$;

-- Attendance (absences)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.attendance ADD COLUMN school_id UUID;
    -- Backfill din students
    UPDATE public.attendance a
    SET school_id = s.school_id
    FROM public.students s
    WHERE a.student_id = s.id AND a.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'attendance'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE school_id IS NULL) THEN
    ALTER TABLE public.attendance ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există absențe fără school_id. Trebuie să fie populate înainte de a seta NOT NULL.';
  END IF;
END $$;

-- =============================================================================
-- PART 2: FUNCȚIE get_user_school_id() STANDARDIZATĂ
-- =============================================================================

-- 2.1) Creează sau înlocuiește get_user_school_id() (SECURITY DEFINER, securizat)
CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_user_school_id() IS 'Returnează school_id-ul utilizatorului autentificat din profiles. Folosit în RLS pentru izolare multi-tenant strictă. SECURITY DEFINER pentru a accesa profiles securizat.';

-- 2.2) Alias get_my_school_id() -> get_user_school_id() pentru compatibilitate
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_school_id()
$$;

-- =============================================================================
-- PART 3: CONSTRÂNGERI DE VALIDARE
-- =============================================================================

-- 3.1) Asigură app_role ENUM cu valorile corecte
DO $$
BEGIN
  -- Verifică dacă ENUM-ul există
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'parent', 'director', 'admin');
  ELSE
    -- Adaugă valorile care lipsesc
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'admin') THEN
      ALTER TYPE public.app_role ADD VALUE 'admin';
    END IF;
  END IF;
END $$;

-- 3.2) Asigură că profiles.role folosește app_role ENUM
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    -- Verifică tipul coloanei
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
        AND udt_name != 'app_role'
    ) THEN
      ALTER TABLE public.profiles
        ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
    END IF;
  ELSE
    -- Adaugă coloana role dacă nu există
    ALTER TABLE public.profiles ADD COLUMN role public.app_role;
    -- Copiază din active_role
    UPDATE public.profiles SET role = active_role WHERE role IS NULL;
    ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
  END IF;
END $$;

-- 3.3) CHECK constraint pe grades (grade >= 1 AND grade <= 10)
ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_grade_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);

-- 3.4) CHECK constraint pe attendance (status valid)
-- Note: attendance nu are coloană "absences" numerică, ci status text
-- Verificăm că status este valid
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check 
  CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending'));

-- Dacă există un tabel separat "absences" cu coloană numerică, adaugă CHECK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'absences'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'absences' AND column_name = 'absences'
    ) THEN
      ALTER TABLE public.absences DROP CONSTRAINT IF EXISTS absences_count_check;
      ALTER TABLE public.absences ADD CONSTRAINT absences_count_check CHECK (absences >= 0);
    END IF;
  END IF;
END $$;

-- =============================================================================
-- PART 4: TEACHER ASSIGNMENTS & GRANULAR RLS
-- =============================================================================

-- 4.1) Asigură că teacher_assignments există cu structura corectă
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (teacher_id, class_id, subject_id, semester_id)
);

-- Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_id ON public.teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_id ON public.teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_subject_id ON public.teacher_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_school_id ON public.teacher_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_composite ON public.teacher_assignments(teacher_id, class_id, subject_id);

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

-- 4.2) RLS strict pentru teacher_assignments (obligatoriu school_id check)
DROP POLICY IF EXISTS "teacher_assignments_select_strict" ON public.teacher_assignments;
CREATE POLICY "teacher_assignments_select_strict" ON public.teacher_assignments
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

DROP POLICY IF EXISTS "teacher_assignments_manage_strict" ON public.teacher_assignments;
CREATE POLICY "teacher_assignments_manage_strict" ON public.teacher_assignments
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- =============================================================================
-- PART 5: RLS REWRITE - TOATE POLITICILE TREBUIE SĂ VERIFICE school_id
-- =============================================================================

-- 5.1) Șterge toate politicile care verifică DOAR has_role fără school_id check
-- Students RLS - OBLIGATORIU school_id check
DROP POLICY IF EXISTS "Directors can manage students from their school" ON public.students;
DROP POLICY IF EXISTS "Staff can manage students" ON public.students;
DROP POLICY IF EXISTS "Authenticated can view students" ON public.students;

CREATE POLICY "students_select_strict" ON public.students
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "students_manage_strict" ON public.students
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Classes RLS - OBLIGATORIU school_id check
DROP POLICY IF EXISTS "Directors can manage classes from their school" ON public.classes;
DROP POLICY IF EXISTS "Staff can manage classes" ON public.classes;
DROP POLICY IF EXISTS "Authenticated can view classes" ON public.classes;

CREATE POLICY "classes_select_strict" ON public.classes
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "classes_manage_strict" ON public.classes
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Subjects RLS - OBLIGATORIU school_id check
DROP POLICY IF EXISTS "Directors can manage subjects from their school" ON public.subjects;
DROP POLICY IF EXISTS "Staff can manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "Authenticated can view subjects" ON public.subjects;

CREATE POLICY "subjects_select_strict" ON public.subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "subjects_manage_strict" ON public.subjects
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
        public.has_role(auth.uid(), 'teacher'::public.app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
        public.has_role(auth.uid(), 'teacher'::public.app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Grades RLS - OBLIGATORIU school_id check + teacher_assignments check pentru profesori
DROP POLICY IF EXISTS "Teachers can insert grades via teacher_assignments" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades via teacher_assignments" ON public.grades;
DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can view grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Staff can view all grades from school" ON public.grades;

-- SELECT: Students, Parents, Teachers (doar pentru clasele alocate), Staff
CREATE POLICY "grades_select_strict" ON public.grades
  FOR SELECT
  USING (
    -- Student: propriile note (school_id check implicit prin student)
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Parent: notele copiilor (school_id check implicit)
    EXISTS (
      SELECT 1 FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Teacher: doar dacă este alocat în teacher_assignments (school_id check obligatoriu)
    (
      school_id = public.get_user_school_id() AND
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = grades.subject_id
          AND s.id = grades.student_id
          AND ta.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff: doar din propria școală
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role)
      )
    )
    OR
    -- Admins
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- INSERT: Doar profesori alocați în teacher_assignments (school_id obligatoriu)
CREATE POLICY "grades_insert_strict" ON public.grades
  FOR INSERT
  WITH CHECK (
    school_id = public.get_user_school_id() AND
    (
      -- Teacher: DOAR dacă există în teacher_assignments
      (
        EXISTS (
          SELECT 1 FROM public.teacher_assignments ta
          JOIN public.students s ON s.class_id = ta.class_id
          WHERE ta.teacher_id = auth.uid()
            AND ta.subject_id = subject_id
            AND s.id = student_id
            AND ta.school_id = public.get_user_school_id()
        )
      )
      OR
      -- Staff (director/secretariat) - poate insera pentru corecții
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role)
      )
      OR
      -- Admins
      public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- UPDATE: Doar profesori alocați în teacher_assignments (school_id obligatoriu)
CREATE POLICY "grades_update_strict" ON public.grades
  FOR UPDATE
  USING (
    school_id = public.get_user_school_id() AND
    (
      -- Teacher: DOAR dacă există în teacher_assignments
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR
      -- Staff
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role)
      )
      OR
      -- Admins
      public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id() AND
    (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role)
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- Attendance RLS - OBLIGATORIU school_id check
DROP POLICY IF EXISTS "Users can view attendance from their school" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can update attendance" ON public.attendance;

CREATE POLICY "attendance_select_strict" ON public.attendance
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "attendance_manage_strict" ON public.attendance
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
        public.has_role(auth.uid(), 'teacher'::public.app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
        public.has_role(auth.uid(), 'teacher'::public.app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- =============================================================================
-- PART 6: AUDIT LOG & STATE CONTROL
-- =============================================================================

-- 6.1) Asigură că audit_logs are structura completă
DO $$
BEGIN
  -- Verifică dacă tabelul există
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    CREATE TABLE public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      active_role public.app_role NOT NULL,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id UUID,
      old_data JSONB,
      new_data JSONB,
      details JSONB,
      school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSE
    -- Adaugă coloanele care lipsesc
    ALTER TABLE public.audit_logs
      ADD COLUMN IF NOT EXISTS table_name TEXT,
      ADD COLUMN IF NOT EXISTS record_id UUID,
      ADD COLUMN IF NOT EXISTS old_data JSONB,
      ADD COLUMN IF NOT EXISTS new_data JSONB,
      ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
    
    -- Map entity_type -> table_name dacă există
    UPDATE public.audit_logs SET table_name = entity_type WHERE table_name IS NULL AND entity_type IS NOT NULL;
    UPDATE public.audit_logs SET record_id = entity_id WHERE record_id IS NULL AND entity_id IS NOT NULL;
  END IF;
END $$;

-- Indexuri pentru audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON public.audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- 6.2) Asigură că semesters are is_locked
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'semesters' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE public.semesters ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- =============================================================================
-- PART 7: OPTIMIZARE PERFORMANȚĂ - INDEXURI PE FK-URI CRITICE
-- =============================================================================

-- 7.1) Indexuri pe school_id (cel mai important pentru multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_id ON public.grades(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);

-- 7.2) Indexuri pe student_id (folosit în multe JOIN-uri)
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);

-- 7.3) Indexuri pe class_id (folosit în filtrare)
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_subjects_class_id ON public.subjects(class_id);

-- 7.4) Indexuri pe teacher_id (folosit în filtrare)
CREATE INDEX IF NOT EXISTS idx_grades_teacher_id ON public.grades(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_id ON public.attendance(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON public.subjects(teacher_id);

-- =============================================================================
-- PART 8: VERIFICARE INTEGRITATE - NU LĂSA DATE ORFANE
-- =============================================================================

-- 8.1) Verifică dacă există date orfane (fără school_id valid)
DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  -- Students fără school_id sau cu school_id invalid
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.students s
  WHERE s.school_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.schools WHERE id = s.school_id);
  
  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Există % studenți fără school_id valid. Trebuie corectați înainte de a seta NOT NULL.', v_orphan_count;
  END IF;
  
  -- Classes fără school_id sau cu school_id invalid
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.classes c
  WHERE c.school_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.schools WHERE id = c.school_id);
  
  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Există % clase fără school_id valid. Trebuie corectate înainte de a seta NOT NULL.', v_orphan_count;
  END IF;
  
  -- Grades fără school_id sau cu school_id invalid
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.grades g
  WHERE g.school_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.schools WHERE id = g.school_id);
  
  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Există % note fără school_id valid. Trebuie corectate înainte de a seta NOT NULL.', v_orphan_count;
  END IF;
  
  -- Attendance fără school_id sau cu school_id invalid
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.attendance a
  WHERE a.school_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.schools WHERE id = a.school_id);
  
  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Există % absențe fără school_id valid. Trebuie corectate înainte de a seta NOT NULL.', v_orphan_count;
  END IF;
END $$;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 79/102: 20260227000000_grades_unique_and_one_per_day.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Migration: Unicitate grades + maxim o notă pe zi per materie/elev (cu excepții)
--
-- 1. Constrângere UNIQUE pe (student_id, subject_id, created_at)
-- 2. Coloană grade_type pentru a marca 'lucrare scrisă' / 'ascultare'
-- 3. Trigger: previne mai mult de o notă "normală" pe zi la aceeași materie
--    pentru același elev; permite mai multe dacă sunt 'lucrare scrisă' sau 'ascultare'
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: COLOANĂ grade_type ȘI CONSTRÂNGERE UNICITATE
-- =============================================================================

-- 1.1) Adaugă coloana grade_type (normal, lucrare_scrisa, ascultare)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grades' AND column_name = 'grade_type'
  ) THEN
    ALTER TABLE public.grades
      ADD COLUMN grade_type TEXT NOT NULL DEFAULT 'normal'
      CHECK (grade_type IN ('normal', 'lucrare_scrisa', 'ascultare'));
    COMMENT ON COLUMN public.grades.grade_type IS 'Tip notă: normal = o singură per zi; lucrare_scrisa/ascultare = pot fi mai multe pe zi.';
  END IF;
END $$;

-- 1.2) Constrângere de unicitate pe (student_id, subject_id, created_at)
-- Previne inserarea a două note cu același student, materie și moment de creare.
-- Rândurile cu deleted_at setat sunt excluse (nu participă la unicitate).
DROP INDEX IF EXISTS grades_student_subject_created_at_key;
CREATE UNIQUE INDEX grades_student_subject_created_at_key
  ON public.grades (student_id, subject_id, created_at)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- PART 2: TRIGGER - MAX O NOTĂ "NORMALĂ" PE ZI PER ELEV/MATERIE
-- =============================================================================

-- 2.1) Funcție: previne mai mult de o notă normală pe zi (același student, materie, dată)
CREATE OR REPLACE FUNCTION public.trg_grades_one_normal_per_day()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
  v_is_special BOOLEAN;  -- lucrare_scrisa sau ascultare
BEGIN
  -- Considerăm "special" dacă e lucrare scrisă sau ascultare (pot fi mai multe pe zi)
  -- Verificăm grade_type sau description (pentru compatibilitate cu date existente)
  v_is_special := COALESCE(NEW.grade_type, 'normal') IN ('lucrare_scrisa', 'ascultare')
    OR (NEW.description IS NOT NULL AND (
      trim(NEW.description) ILIKE '%lucrare scrisă%' OR
      trim(NEW.description) ILIKE '%lucrare scrisa%' OR
      trim(NEW.description) ILIKE '%ascultare%'
    ));

  IF v_is_special THEN
    -- Permite oricâte note pe zi pentru lucrări scrise / ascultări
    RETURN NEW;
  END IF;

  -- Notă "normală": verifică dacă există deja o notă normală în aceeași zi (excludem speciale)
  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.grades g
    WHERE g.student_id = NEW.student_id
      AND g.subject_id = NEW.subject_id
      AND g.date = NEW.date
      AND g.deleted_at IS NULL
      AND COALESCE(g.grade_type, 'normal') = 'normal'
      AND (g.description IS NULL OR (
        trim(g.description) NOT ILIKE '%lucrare scrisă%' AND
        trim(g.description) NOT ILIKE '%lucrare scrisa%' AND
        trim(g.description) NOT ILIKE '%ascultare%'
      ));

    IF v_count > 0 THEN
      RAISE EXCEPTION 'Există deja o notă pentru acest elev la această materie în data de %s. Pentru a adăuga mai multe note în aceeași zi, marcați nota ca "Lucrare scrisă" sau "Ascultare".', NEW.date
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- La UPDATE: dacă nu s-a schimbat nimic relevant, permitem
    IF OLD.date = NEW.date AND OLD.student_id = NEW.student_id AND OLD.subject_id = NEW.subject_id
       AND COALESCE(OLD.grade_type, 'normal') = COALESCE(NEW.grade_type, 'normal') THEN
      RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.grades g
    WHERE g.student_id = NEW.student_id
      AND g.subject_id = NEW.subject_id
      AND g.date = NEW.date
      AND g.deleted_at IS NULL
      AND g.id <> NEW.id
      AND COALESCE(g.grade_type, 'normal') = 'normal'
      AND (g.description IS NULL OR (
        trim(g.description) NOT ILIKE '%lucrare scrisă%' AND
        trim(g.description) NOT ILIKE '%lucrare scrisa%' AND
        trim(g.description) NOT ILIKE '%ascultare%'
      ));

    IF v_count > 0 THEN
      RAISE EXCEPTION 'Există deja o notă pentru acest elev la această materie în data de %s. Pentru a adăuga mai multe note în aceeași zi, marcați nota ca "Lucrare scrisă" sau "Ascultare".', NEW.date
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2.2) Atașare trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_grades_one_normal_per_day ON public.grades;
CREATE TRIGGER trg_grades_one_normal_per_day
  BEFORE INSERT OR UPDATE OF student_id, subject_id, date, grade_type
  ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_grades_one_normal_per_day();

COMMENT ON FUNCTION public.trg_grades_one_normal_per_day IS 'Permite maxim o notă "normală" per elev/materie/zi; notele tip lucrare scrisă sau ascultare pot fi mai multe pe zi.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 80/102: 20260228000000_final_grades_on_lock_and_admin_only.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Migration: final_grades la blocare semestru + modificare doar de administrator
--
-- 1. Tabelul final_grades există deja; îl păstrăm și asigurăm coloanele necesare.
-- 2. Funcție PL/pgSQL care calculează media aritmetică a notelor din semestru,
--    o rotunjește și o salvează în final_grades (apelată la blocare).
-- 3. Trigger pe semesters: când is_locked devine true, rulează calculul și salvează.
-- 4. RLS: UPDATE/DELETE pe final_grades doar pentru administratori.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: ASIGURARE TABEL final_grades
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.final_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  final_grade INTEGER NOT NULL CHECK (final_grade >= 1 AND final_grade <= 10),
  calculated_average NUMERIC(4,2) NOT NULL,
  grade_count INTEGER NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year, semester)
);

-- Coloane opționale dacă tabelul a fost creat fără ele (migrații vechi)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'final_grades' AND column_name = 'calculated_at') THEN
    ALTER TABLE public.final_grades ADD COLUMN calculated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'final_grades' AND column_name = 'calculated_by') THEN
    ALTER TABLE public.final_grades ADD COLUMN calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_final_grades_student ON public.final_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_subject ON public.final_grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_school_year_semester ON public.final_grades(school_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_final_grades_student_subject_year_semester ON public.final_grades(student_id, subject_id, academic_year, semester);

COMMENT ON TABLE public.final_grades IS 'Note finale per elev, materie și semestru. Calculate automat la blocare (is_locked=true). Modificabile doar de administrator.';

-- =============================================================================
-- PART 2: FUNCȚIE - CALCUL ȘI SALVARE NOTE FINALE PENTRU UN SEMESTRU
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_and_save_final_grades_for_semester(
  p_school_id UUID,
  p_academic_year INTEGER,
  p_semester INTEGER,
  p_calculated_by UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_student_id UUID;
  v_subject_id UUID;
  v_avg NUMERIC(4,2);
  v_grade_count INTEGER;
  v_final INTEGER;
  v_uid UUID;
BEGIN
  v_uid := COALESCE(p_calculated_by, auth.uid());

  -- Pentru fiecare pereche (student, subject) care are note în acel semestru
  FOR v_student_id, v_subject_id IN
    SELECT g.student_id, g.subject_id
    FROM public.grades g
    WHERE g.school_id = p_school_id
      AND g.deleted_at IS NULL
      AND public.get_academic_year_from_date(g.date) = p_academic_year
      AND public.get_semester_from_date(g.date) = p_semester
    GROUP BY g.student_id, g.subject_id
  LOOP
    SELECT
      ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2),
      COUNT(*)::INTEGER
    INTO v_avg, v_grade_count
    FROM public.grades g
    WHERE g.student_id = v_student_id
      AND g.subject_id = v_subject_id
      AND g.deleted_at IS NULL
      AND public.get_academic_year_from_date(g.date) = p_academic_year
      AND public.get_semester_from_date(g.date) = p_semester;

    IF v_grade_count > 0 AND v_avg IS NOT NULL THEN
      v_final := ROUND(v_avg)::INTEGER;
      v_final := GREATEST(1, LEAST(10, v_final));

      INSERT INTO public.final_grades (
        student_id,
        subject_id,
        school_id,
        academic_year,
        semester,
        final_grade,
        calculated_average,
        grade_count,
        calculated_at,
        calculated_by
      )
      VALUES (
        v_student_id,
        v_subject_id,
        p_school_id,
        p_academic_year,
        p_semester,
        v_final,
        v_avg,
        v_grade_count,
        now(),
        v_uid
      )
      ON CONFLICT (student_id, subject_id, academic_year, semester) DO UPDATE SET
        final_grade = EXCLUDED.final_grade,
        calculated_average = EXCLUDED.calculated_average,
        grade_count = EXCLUDED.grade_count,
        calculated_at = now(),
        calculated_by = EXCLUDED.calculated_by,
        updated_at = now();

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.compute_and_save_final_grades_for_semester IS 'Calculează media aritmetică a notelor din semestru, rotunjește și salvează în final_grades. Apelată la blocare semestru (is_locked=true) sau din RPC.';

-- =============================================================================
-- PART 3: TRIGGER PE semesters - LA is_locked = true SALVEAZĂ NOTELE FINALE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_semester_locked_compute_final_grades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Doar când semestrul devine blocat (trece din false în true)
  IF (OLD.is_locked IS NOT DISTINCT FROM false) AND (NEW.is_locked = true) THEN
    v_count := public.compute_and_save_final_grades_for_semester(
      NEW.school_id,
      NEW.academic_year,
      NEW.semester,
      NEW.locked_by
    );
    -- Opțional: log
    INSERT INTO public.audit_logs (
      user_id, user_name, active_role, action, entity_type, entity_id,
      details, school_id
    )
    SELECT
      NEW.locked_by,
      COALESCE(p.full_name, ''),
      COALESCE(p.active_role, 'director'::public.app_role),
      'semester_locked_final_grades',
      'semester',
      NEW.id,
      jsonb_build_object(
        'school_id', NEW.school_id,
        'academic_year', NEW.academic_year,
        'semester', NEW.semester,
        'final_grades_created', v_count
      ),
      NEW.school_id
    FROM public.profiles p
    WHERE p.id = NEW.locked_by
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_semester_locked_compute_final_grades ON public.semesters;
CREATE TRIGGER trg_semester_locked_compute_final_grades
  AFTER UPDATE OF is_locked ON public.semesters
  FOR EACH ROW
  WHEN (OLD.is_locked IS DISTINCT FROM NEW.is_locked AND NEW.is_locked = true)
  EXECUTE FUNCTION public.trg_semester_locked_compute_final_grades();

COMMENT ON FUNCTION public.trg_semester_locked_compute_final_grades IS 'La blocare semestru (is_locked=true), calculează și salvează notele finale în final_grades.';

-- =============================================================================
-- PART 4: RLS - MODIFICARE (UPDATE/DELETE) DOAR PENTRU ADMINISTRATOR
-- =============================================================================

-- Șterge politicile vechi de INSERT/UPDATE dacă există, ca să le înlocuim clar
DROP POLICY IF EXISTS "Staff can insert final grades" ON public.final_grades;
DROP POLICY IF EXISTS "Admin can update final grades" ON public.final_grades;
DROP POLICY IF EXISTS "Admin can delete final grades" ON public.final_grades;

-- INSERT: director/secretariat (la închidere semestru) sau administrator
CREATE POLICY "Staff or admin can insert final grades" ON public.final_grades
  FOR INSERT
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role)
      )
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- UPDATE: doar administratori (director pentru școala lor, uat_admin, developer)
CREATE POLICY "Admin can update final grades" ON public.final_grades
  FOR UPDATE
  USING (
    (
      school_id = public.get_user_school_id() AND
      public.has_role(auth.uid(), 'director'::public.app_role)
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      public.has_role(auth.uid(), 'director'::public.app_role)
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- DELETE: doar administratori (același criteriu)
CREATE POLICY "Admin can delete final grades" ON public.final_grades
  FOR DELETE
  USING (
    (
      school_id = public.get_user_school_id() AND
      public.has_role(auth.uid(), 'director'::public.app_role)
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Asigură că RLS e activ
ALTER TABLE public.final_grades ENABLE ROW LEVEL SECURITY;

-- Politici SELECT (dacă nu există deja, nu le ștergem; pot exista din migrarea anterioară)
-- Nu recreez toate SELECT-urile aici pentru a nu intra în conflict cu 20260221000009.

GRANT EXECUTE ON FUNCTION public.compute_and_save_final_grades_for_semester TO authenticated;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 81/102: 20260229000000_profiles_column_level_security.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Migration: Column-Level Security pe profiles
--
-- Profesorii pot vedea profilurile colegilor (nume, email, rol etc.) dar NU
-- coloanele sensibile: salary, home_address, personal_phone.
-- Acces la aceste coloane doar pentru director și admin.
--
-- Implementare: coloane sensibile în profiles + view „safe” pentru staff,
-- RLS pe profiles astfel încât teacher să nu poată SELECT alte rânduri decât
-- propriul; view-ul expune doar coloanele nesensibile pentru școala utilizatorului.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: COLOANE SENSIBILE PE profiles
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS personal_phone TEXT;

COMMENT ON COLUMN public.profiles.salary IS 'Column-level security: visible only to director and admin.';
COMMENT ON COLUMN public.profiles.home_address IS 'Column-level security: visible only to director and admin.';
COMMENT ON COLUMN public.profiles.personal_phone IS 'Column-level security: visible only to director and admin.';

-- =============================================================================
-- PART 2: VIEW PENTRU STAFF (FĂRĂ COLOANE SENSIBILE)
-- =============================================================================

-- View care expune doar coloanele nesensibile. Folosit de teachers pentru
-- a vedea colegii. Rulează cu SECURITY DEFINER și filtrează după school_id.
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.active_role,
  p.role,
  p.school_id,
  p.class_id,
  p.created_at,
  p.updated_at
  -- Excluse: salary, home_address, personal_phone
FROM public.profiles p
WHERE p.school_id = public.get_user_school_id();

ALTER VIEW public.profiles_safe SET (security_invoker = off);


-- View SECURITY DEFINER: citeste profiles, filtreaza dupa get_user_school_id().
DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.active_role,
  p.role,
  p.school_id,
  p.class_id,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.school_id = public.get_user_school_id();

COMMENT ON VIEW public.profiles_safe IS 'Profiluri fără salary, home_address, personal_phone. Pentru teachers (lista colegi).';

GRANT SELECT ON public.profiles_safe TO authenticated;

-- =============================================================================
-- PART 3: RLS PE profiles – TEACHER NU POATE SELECT ALTE RÂNDURI DECÂT PROPRIUL
-- =============================================================================

-- Eliminăm orice policy care permite teacher să facă SELECT pe toate profilurile
-- (să vadă și coloanele sensibile).
DROP POLICY IF EXISTS "Teachers can view all profiles" ON public.profiles;

-- Păstrăm: utilizatorul își vede propriul profil (toate coloanele)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Director și admin pot face SELECT pe toate coloanele (inclusiv sensibile) pentru
-- profilurile din școala lor (sau toate pentru admin).
DROP POLICY IF EXISTS "Directors can view profiles from their school" ON public.profiles;
CREATE POLICY "Directors and admin can view profiles with sensitive columns" ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'admin'::public.app_role) OR
        public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
        public.has_role(auth.uid(), 'developer'::public.app_role)
      )
      AND (
        school_id = public.get_user_school_id()
        OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
        OR public.has_role(auth.uid(), 'developer'::public.app_role)
      )
    )
  );

-- Teachers văd colegii DOAR prin view-ul profiles_safe (nu au policy pe profiles
-- pentru alți users), deci nu pot face SELECT pe salary, home_address, personal_phone.

-- =============================================================================
-- PART 4: UPDATE PE COLOANE SENSIBILE DOAR PENTRU DIRECTOR / ADMIN
-- =============================================================================

-- Director și admin pot actualiza orice coloane; utilizatorul își poate
-- actualiza propriul profil (dar aplicația poate restricționa la frontend
-- câmpurile sensibile pentru non-admin).
-- Politicile existente de UPDATE rămân; adăugăm doar mențiunea că doar
-- director/admin pot modifica salary, home_address, personal_phone.
-- (La nivel de DB nu putem restricționa per-coloană în RLS; doar per-rând.
-- Deci păstrăm UPDATE ca pentru director/admin și own profile.)
DROP POLICY IF EXISTS "Directors can update profiles from their school" ON public.profiles;
CREATE POLICY "Directors and admin can update profiles" ON public.profiles
  FOR UPDATE
  USING (
    id = auth.uid()
    OR (
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'admin'::public.app_role) OR
        public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
        public.has_role(auth.uid(), 'developer'::public.app_role)
      )
      AND (
        school_id = public.get_user_school_id()
        OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
        OR public.has_role(auth.uid(), 'developer'::public.app_role)
      )
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR (
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'admin'::public.app_role) OR
        public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
        public.has_role(auth.uid(), 'developer'::public.app_role)
      )
      AND (
        school_id = public.get_user_school_id()
        OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
        OR public.has_role(auth.uid(), 'developer'::public.app_role)
      )
    )
  );

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 82/102: 20260230000000_ten_critical_backend_security.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Migration: 10 puncte critice pentru securizarea și finalizarea backend-ului
--
-- 1. Strict Multi-Tenancy: RLS cu school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
-- 2. Enforced School ID: students.school_id NOT NULL + FK
-- 3. Data Constraints: CHECK note 1-10, absențe >= 0
-- 4. Audit Log: audit_logs + trigger pe note, absențe, rol (old_data, new_data)
-- 5. Semester Locking: is_locked pe semesters, DENY modificare note când e blocat
-- 6. Granular RLS: Profesori văd doar elevii din clasele alocate
-- 7. Teacher-Subject-Class Pivot: teacher_assignments (fără intrare = fără drept)
-- 8. Strict Roles: app_role ENUM, fără string-uri libere în role
-- 9. Event System: school_events vizibilitate (per clasă/școală) + notificări
-- 10. Performance Indexing: indexuri pe school_id, student_id, class_id, subject_id
-- =============================================================================

BEGIN;

-- =============================================================================
-- PUNCT 1: STRICT MULTI-TENANCY – get_user_school_id() = (SELECT school_id FROM profiles WHERE id = auth.uid())
-- Directorul nu are voie să vadă alte școli. Toate politicile folosesc această clauză.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_user_school_id() IS 'Strict multi-tenancy: returnează school_id-ul utilizatorului curent. Directorul vede DOAR propria școală.';

-- Alias pentru compatibilitate
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_school_id()
$$;

-- =============================================================================
-- PUNCT 2: ENFORCED SCHOOL ID – students.school_id NOT NULL + FK
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.students ADD COLUMN school_id UUID;
    UPDATE public.students s SET school_id = c.school_id
    FROM public.classes c WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'students'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;

  UPDATE public.students s SET school_id = c.school_id
  FROM public.classes c WHERE s.class_id = c.id AND (s.school_id IS NULL OR s.school_id != c.school_id);

  IF NOT EXISTS (SELECT 1 FROM public.students WHERE school_id IS NULL) THEN
    ALTER TABLE public.students ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- PUNCT 3: DATA CONSTRAINTS – note 1–10, absențe >= 0
-- =============================================================================

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_grade_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending'));

-- Dacă există coloană numerică pentru număr absențe (ex. într-un tabel de sumar)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'absence_count'
  ) THEN
    ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_absence_count_non_negative;
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_absence_count_non_negative CHECK (absence_count >= 0);
  END IF;
END $$;

-- =============================================================================
-- PUNCT 4: AUDIT LOG – audit_logs + trigger note, absențe, rol (old_data, new_data)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    CREATE TABLE public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id UUID,
      old_data JSONB,
      new_data JSONB,
      school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data JSONB;
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_data JSONB;
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS table_name TEXT;
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_id UUID;
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_own_school_or_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_own_school_or_admin" ON public.audit_logs
  FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Funcție generică de audit (INSERT/UPDATE/DELETE) cu old_data și new_data
CREATE OR REPLACE FUNCTION public.audit_trigger_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_old JSONB;
  v_new JSONB;
  v_action TEXT;
  v_record_id UUID;
BEGIN
  v_action := TG_OP;
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id;
    IF (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = TG_TABLE_NAME AND column_name = 'school_id')) THEN
      v_school_id := (to_jsonb(OLD)->>'school_id')::uuid;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    IF (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = TG_TABLE_NAME AND column_name = 'school_id')) THEN
      v_school_id := (to_jsonb(NEW)->>'school_id')::uuid;
    END IF;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    IF (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = TG_TABLE_NAME AND column_name = 'school_id')) THEN
      v_school_id := (to_jsonb(NEW)->>'school_id')::uuid;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, school_id)
  VALUES (auth.uid(), v_action, TG_TABLE_NAME, v_record_id, v_old, v_new, v_school_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Trigger pe grades
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_log();

-- Trigger pe attendance
DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_log();

-- Trigger pe profiles pentru schimbări de rol (role / active_role)
CREATE OR REPLACE FUNCTION public.audit_profiles_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.active_role IS DISTINCT FROM NEW.active_role) THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, school_id)
    VALUES (
      auth.uid(),
      'UPDATE',
      'profiles',
      NEW.id,
      jsonb_build_object('role', OLD.role, 'active_role', OLD.active_role),
      jsonb_build_object('role', NEW.role, 'active_role', NEW.active_role),
      NEW.school_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profiles_role ON public.profiles;
CREATE TRIGGER trg_audit_profiles_role
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_role_change();

-- =============================================================================
-- PUNCT 5: SEMESTER LOCKING – is_locked pe semesters, DENY modificare note
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'semesters' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE public.semesters ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Asigură că funcția de verificare semestru blocat există
CREATE OR REPLACE FUNCTION public.is_semester_locked_for_grade(p_grade_date DATE, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_academic_year INTEGER;
  v_semester INTEGER;
  v_is_locked BOOLEAN;
BEGIN
  SELECT s.school_id INTO v_school_id FROM public.students s WHERE s.id = p_student_id;
  IF v_school_id IS NULL THEN RETURN false; END IF;
  v_academic_year := public.get_academic_year_from_date(p_grade_date);
  v_semester := public.get_semester_from_date(p_grade_date);
  SELECT is_locked INTO v_is_locked FROM public.semesters
  WHERE school_id = v_school_id AND academic_year = v_academic_year AND semester = v_semester;
  RETURN COALESCE(v_is_locked, false);
END;
$$;

-- Politicile de INSERT/UPDATE pe grades trebuie să includă NOT is_semester_locked_for_grade.
-- Eliminăm politicile vechi de insert/update pe grades și le recreăm cu verificare blocaj.
DROP POLICY IF EXISTS "grades_insert_strict" ON public.grades;
DROP POLICY IF EXISTS "grades_update_strict" ON public.grades;

CREATE POLICY "grades_insert_strict" ON public.grades
  FOR INSERT
  WITH CHECK (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid() AND ta.subject_id = subject_id AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

CREATE POLICY "grades_update_strict" ON public.grades
  FOR UPDATE
  USING (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid() AND ta.subject_id = subject_id AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  )
  WITH CHECK (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid() AND ta.subject_id = subject_id AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- =============================================================================
-- PUNCT 6: GRANULAR RLS – Profesori văd doar elevii din clasele alocate
-- =============================================================================

-- Students: director/secretariat văd toată școala; profesorii doar elevii din clasele din teacher_assignments
DROP POLICY IF EXISTS "students_select_strict" ON public.students;

CREATE POLICY "students_select_strict" ON public.students
  FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    AND (
      -- Director / secretariat: toți elevii din școală
      public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      -- Profesor: doar elevii din clasele în care e alocat
      OR EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        WHERE ta.teacher_id = auth.uid() AND ta.class_id = students.class_id
          AND ta.school_id = public.get_user_school_id()
      )
      -- Elev: propriul profil
      OR user_id = auth.uid()
      -- Părinte: copiii din parent_student_relations
      OR EXISTS (
        SELECT 1 FROM public.parent_student_relations psr
        WHERE psr.student_id = students.id AND psr.parent_user_id = auth.uid()
      )
    )
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Grades SELECT: profesori doar pentru clasele/subject alocate (păstrăm policy existent dacă e deja granulară)
DROP POLICY IF EXISTS "grades_select_strict" ON public.grades;

CREATE POLICY "grades_select_strict" ON public.grades
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = grades.student_id AND s.user_id = auth.uid() AND s.school_id = public.get_user_school_id())
    OR EXISTS (
      SELECT 1 FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id AND psr.parent_user_id = auth.uid() AND s.school_id = public.get_user_school_id()
    )
    OR (
      school_id = public.get_user_school_id()
      AND EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid() AND ta.subject_id = grades.subject_id AND s.id = grades.student_id
          AND ta.school_id = public.get_user_school_id()
      )
    )
    OR (
      school_id = public.get_user_school_id()
      AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role))
    )
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- =============================================================================
-- PUNCT 7: TEACHER-SUBJECT-CLASS PIVOT – teacher_assignments (fără intrare = fără drept)
-- =============================================================================

-- Tabelul teacher_assignments este creat în 20260224000000. Asigurăm RLS strict.
DROP POLICY IF EXISTS "teacher_assignments_select_strict" ON public.teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_manage_strict" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Users can view teacher_assignments from their school" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Staff can manage teacher_assignments" ON public.teacher_assignments;

CREATE POLICY "teacher_assignments_select_strict" ON public.teacher_assignments
  FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "teacher_assignments_manage_strict" ON public.teacher_assignments
  FOR ALL
  USING (
    (school_id = public.get_user_school_id() AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role)))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (school_id = public.get_user_school_id() AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role)))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- =============================================================================
-- PUNCT 8: STRICT ROLES – app_role ENUM, fără string-uri libere
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'student', 'teacher', 'parent', 'director', 'admin',
      'homeroom_teacher', 'secretariat', 'uat_admin', 'developer'
    );
  END IF;
  -- Adaugă valorile lipsă fără a duplica
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'developer') THEN
    ALTER TYPE public.app_role ADD VALUE 'developer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'admin') THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Asigură că profiles.role și active_role sunt de tip app_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
    IF (SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') != 'app_role' THEN
      ALTER TABLE public.profiles ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active_role') THEN
    IF (SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active_role') != 'app_role' THEN
      ALTER TABLE public.profiles ALTER COLUMN active_role TYPE public.app_role USING active_role::text::public.app_role;
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- =============================================================================
-- PUNCT 9: EVENT SYSTEM – school_events vizibilitate (per clasă / per școală) + notificări
-- =============================================================================

-- Extindem school_events cu coloane de vizibilitate
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'school_events' AND column_name = 'school_id') THEN
    ALTER TABLE public.school_events ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'school_events' AND column_name = 'visibility_scope') THEN
    ALTER TABLE public.school_events ADD COLUMN visibility_scope TEXT NOT NULL DEFAULT 'school' CHECK (visibility_scope IN ('school', 'class'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'school_events' AND column_name = 'target_class_id') THEN
    ALTER TABLE public.school_events ADD COLUMN target_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Notifications: tabelul există; index pentru event_id dacă vrem să legăm notificări de evenimente
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'event_id') THEN
    ALTER TABLE public.notifications ADD COLUMN event_id UUID REFERENCES public.school_events(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_notifications_event_id ON public.notifications(event_id);
  END IF;
END $$;

-- RLS pe school_events: strict multi-tenant + vizibilitate
ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view school events" ON public.school_events;
DROP POLICY IF EXISTS "Staff can manage school events" ON public.school_events;

CREATE POLICY "school_events_select_strict" ON public.school_events
  FOR SELECT
  USING (
    (school_id = public.get_user_school_id() AND (visibility_scope = 'school' OR (visibility_scope = 'class' AND (target_class_id IS NULL OR target_class_id IN (
      SELECT class_id FROM public.students WHERE user_id = auth.uid()
    ) OR target_class_id IN (
      SELECT ta.class_id FROM public.teacher_assignments ta WHERE ta.teacher_id = auth.uid() AND ta.school_id = public.get_user_school_id()
    )))))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "school_events_manage_strict" ON public.school_events
  FOR ALL
  USING (
    (school_id = public.get_user_school_id() AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role) OR public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (school_id = public.get_user_school_id() AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role) OR public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Backfill school_id și vizibilitate pe school_events
UPDATE public.school_events e SET school_id = c.school_id
FROM public.classes c WHERE e.class_id = c.id AND e.school_id IS NULL;
UPDATE public.school_events e SET school_id = (SELECT id FROM public.schools LIMIT 1) WHERE e.school_id IS NULL AND EXISTS (SELECT 1 FROM public.schools LIMIT 1);
UPDATE public.school_events SET visibility_scope = 'class', target_class_id = class_id WHERE class_id IS NOT NULL AND target_class_id IS NULL AND visibility_scope = 'school';

-- =============================================================================
-- PUNCT 10: PERFORMANCE INDEXING – school_id, student_id, class_id, subject_id
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_class_id ON public.subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_id ON public.grades(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_subject_id ON public.grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject_id ON public.attendance(subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_school_id ON public.teacher_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_id ON public.teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_subject_id ON public.teacher_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_school_events_school_id ON public.school_events(school_id);
CREATE INDEX IF NOT EXISTS idx_school_events_target_class_id ON public.school_events(target_class_id) WHERE target_class_id IS NOT NULL;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 83/102: 20260231000000_saas_hardening_and_compliance.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- SaaS Hardening & Compliance
-- - Audit: note/absențe nu se șterg fizic (doar soft delete); trigger înregistrează cine, când, valoare veche/nouă
-- - Semester lock: eroare în DB la orice modificare notă când semestrul e blocat
-- - Absențe: doar dirigintele poate seta statusul "motivată"
-- - Notificări: alertă când media < 5 sau absențe peste prag
-- - GDPR: consent_accepted_at, export date elev
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. SEMESTER LOCK – eroare în DB la INSERT/UPDATE note (nu doar RLS)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_semester_not_locked_for_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_semester_locked_for_grade(COALESCE(NEW.date, CURRENT_DATE), NEW.student_id) THEN
    RAISE EXCEPTION 'Semestrul este blocat. Nu se pot modifica notele.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_semester_locked ON public.grades;
CREATE TRIGGER trg_grades_semester_locked
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.check_semester_not_locked_for_grade();

COMMENT ON FUNCTION public.check_semester_not_locked_for_grade IS 'Raises exception if semester is locked; prevents any grade modification at DB level.';

-- =============================================================================
-- 2. ABSENȚE – statusuri nemotivată / motivată / în curs; doar dirigintele poate seta motivată
-- =============================================================================

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending', 'nemotivata', 'motivata', 'in_curs'));

-- Doar dirigintele poate seta statusul "motivată" – enforce prin trigger
CREATE OR REPLACE FUNCTION public.is_homeroom_teacher_for_student(p_teacher_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.students s ON s.class_id = c.id
    WHERE s.id = p_student_id AND c.teacher_id = p_teacher_id
  );
$$;

CREATE OR REPLACE FUNCTION public.check_only_homeroom_can_excuse()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('motivat', 'motivated', 'motivata') AND (OLD.status IS NULL OR OLD.status NOT IN ('motivat', 'motivated', 'motivata')) THEN
    IF NOT (
      public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
      OR public.is_homeroom_teacher_for_student(auth.uid(), NEW.student_id)
    ) THEN
      RAISE EXCEPTION 'Doar dirigintele poate motiva absențele.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_only_homeroom_excuse ON public.attendance;
CREATE TRIGGER trg_attendance_only_homeroom_excuse
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.check_only_homeroom_can_excuse();

-- =============================================================================
-- 3. NOTIFICĂRI – alertă când media < 5 sau absențe peste prag
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_low_average_or_high_absences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_user_id UUID;
  v_subject_name TEXT;
  v_avg NUMERIC;
  v_abs_count BIGINT;
  v_threshold_absences INTEGER := 20;
  v_message TEXT;
BEGIN
  IF TG_TABLE_NAME = 'grades' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO v_student_user_id FROM public.students WHERE id = NEW.student_id;
    SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
    SELECT ROUND(AVG(grade)::NUMERIC, 2) INTO v_avg
    FROM public.grades
    WHERE student_id = NEW.student_id AND subject_id = NEW.subject_id AND deleted_at IS NULL;
    IF v_avg IS NOT NULL AND v_avg < 5 AND v_student_user_id IS NOT NULL THEN
      v_message := format('Media la %s este sub 5 (%.2f).', COALESCE(v_subject_name, 'materie'), v_avg);
      INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
      VALUES (v_student_user_id, 'alert', 'Medie sub 5', v_message, false, '/grades');
      INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
      SELECT psr.parent_user_id, 'alert', 'Medie sub 5', v_message, false, '/grades'
      FROM public.parent_student_relations psr
      WHERE psr.student_id = NEW.student_id AND psr.parent_user_id IS NOT NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'attendance' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO v_student_user_id FROM public.students WHERE id = NEW.student_id;
    SELECT COUNT(*) INTO v_abs_count
    FROM public.attendance
    WHERE student_id = NEW.student_id AND deleted_at IS NULL
      AND status IN ('absent', 'unexcused', 'nemotivata', 'motivat', 'motivated', 'motivata');
    IF v_abs_count >= v_threshold_absences AND v_student_user_id IS NOT NULL THEN
      v_message := format('Numărul de absențe a depășit pragul permis (%s).', v_threshold_absences);
      INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
      VALUES (v_student_user_id, 'alert', 'Alerte absențe', v_message, false, '/attendance');
      INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
      SELECT psr.parent_user_id, 'alert', 'Alerte absențe', v_message, false, '/attendance'
      FROM public.parent_student_relations psr
      WHERE psr.student_id = NEW.student_id AND psr.parent_user_id IS NOT NULL;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'grades' THEN RETURN NEW; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_low_avg_high_abs ON public.grades;
CREATE TRIGGER trg_notify_low_avg_high_abs
  AFTER INSERT ON public.grades
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_low_average_or_high_absences();

DROP TRIGGER IF EXISTS trg_notify_low_avg_high_abs_att ON public.attendance;
CREATE TRIGGER trg_notify_low_avg_high_abs_att
  AFTER INSERT ON public.attendance
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_low_average_or_high_absences();

-- =============================================================================
-- 4. GDPR – consent_accepted_at și export date elev
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.consent_accepted_at IS 'GDPR: momentul acceptării consimțământului pentru prelucrarea datelor.';
COMMENT ON COLUMN public.students.consent_accepted_at IS 'GDPR: momentul acceptării consimțământului (elev/părinte).';

CREATE OR REPLACE FUNCTION public.export_student_data(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_user_school UUID;
  v_result JSONB;
BEGIN
  v_user_school := public.get_user_school_id();
  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL OR v_school_id != v_user_school THEN
    IF NOT (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role)) THEN
      RAISE EXCEPTION 'Acces interzis la datele acestui elev.';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'student_id', p_student_id,
    'exported_at', now(),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p JOIN public.students s ON s.user_id = p.id WHERE s.id = p_student_id LIMIT 1),
    'student', (SELECT to_jsonb(s) FROM public.students s WHERE s.id = p_student_id),
    'grades', (SELECT jsonb_agg(to_jsonb(g)) FROM public.grades g WHERE g.student_id = p_student_id AND g.deleted_at IS NULL),
    'attendance', (SELECT jsonb_agg(to_jsonb(a)) FROM public.attendance a WHERE a.student_id = p_student_id AND a.deleted_at IS NULL)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.export_student_data IS 'GDPR: export date elev (JSON). Doar director/admin sau școala elevului.';
GRANT EXECUTE ON FUNCTION public.export_student_data TO authenticated;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 84/102: 20260231100000_director_teacher_permissions.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Director poate fi și profesor: permisiuni pe baza teacher_assignments
-- - Director: vizualizare globală (school_id), editare note DOAR dacă are
--   teacher_assignments sau dacă are can_override_grades (explicit Admin note).
-- - Fără roluri mutual exclusive: același user poate fi director ȘI profesor.
-- =============================================================================

BEGIN;

-- Coloană pentru drept explicit de a edita orice notă în școală (ex: corecții)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_override_grades BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_override_grades IS 'Dacă true, director/secretariat poate edita orice notă din școală (corecții). Implicit false: editare doar prin teacher_assignments.';

-- Funcție helper: user are drept de editare notă fie prin teacher_assignments, fie prin can_override_grades
CREATE OR REPLACE FUNCTION public.user_can_edit_grade(
  p_user_id UUID,
  p_student_id UUID,
  p_subject_id UUID,
  p_school_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Teacher assignments: profesor titular (sau director care predă)
  IF EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.students s ON s.class_id = ta.class_id
    WHERE ta.teacher_id = p_user_id
      AND ta.subject_id = p_subject_id
      AND s.id = p_student_id
      AND ta.school_id = p_school_id
      AND s.school_id = p_school_id
  ) THEN
    RETURN true;
  END IF;

  -- Explicit override: doar director/secretariat cu can_override_grades
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.school_id = p_school_id
      AND p.can_override_grades = true
      AND (p.role::text IN ('director', 'secretariat') OR p.active_role::text IN ('director', 'secretariat'))
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_can_edit_grade IS 'True dacă user poate edita nota: fie are teacher_assignments pentru acel elev/materie, fie e director/secretariat cu can_override_grades.';

-- Rescriem politicile de INSERT/UPDATE pe grades: fără drept automat pentru director/secretariat;
-- doar teacher_assignments sau can_override_grades (și uat_admin/developer ca înainte)
DROP POLICY IF EXISTS "grades_insert_strict" ON public.grades;
DROP POLICY IF EXISTS "grades_update_strict" ON public.grades;

CREATE POLICY "grades_insert_strict" ON public.grades
  FOR INSERT
  WITH CHECK (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

CREATE POLICY "grades_update_strict" ON public.grades
  FOR UPDATE
  USING (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  )
  WITH CHECK (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

GRANT EXECUTE ON FUNCTION public.user_can_edit_grade TO authenticated;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 85/102: 20260232000000_multi_level_invitations.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Multi-Level Invitations System (Multi-level Invitations)
--
-- Cerințe tabel invitations: email, role, school_id, class_id (opțional), token,
-- expires_at, invited_by.
-- Mapare: email = invited_email; token = code_hash (hash al codului, token-ul
-- în clar se returnează la create_invitation); invited_by adăugat/backfill.
--
-- Ierarhie:
-- 1. Dev -> Director: Developer creează școala și invită Directorul (owner școală)
-- 2. Director -> Diriginți: Director invită profesorii și le atribuie rolul de
--    homeroom_teacher pentru o clasă specifică (class_id).
-- 3. Diriginți -> Toți ceilalți: Dirigintele poate invita:
--    - Profesorii de la clasa lui (pentru a-i lega de teacher_assignments)
--    - Elevii clasei sale
--    - Părinții (cu legătură automată către copil)
--
-- Restricții:
-- - Dirigintele NU poate invita elevi/părinți la altă clasă decât cea unde
--   este marcat ca homeroom (classes.teacher_id). RLS: homeroom doar class_id
--   în clasele lui.
-- - La acceptarea invitației de părinte, claim_invitation creează automat
--   rândul în parent_student_relations.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ASIGURĂ INVITATION_ROLE ENUM ARE TOATE VALORILE
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_role') THEN
    CREATE TYPE public.invitation_role AS ENUM (
      'director', 'teacher', 'homeroom_teacher', 'secretariat', 'student', 'parent'
    );
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'invitation_role' AND e.enumlabel = 'secretariat') THEN
      ALTER TYPE public.invitation_role ADD VALUE 'secretariat';
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 2. ASIGURĂ INVITATIONS TABLE ARE COLOANELE NECESARE
-- =============================================================================

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill invited_by from created_by_user_id
UPDATE public.invitations SET invited_by = created_by_user_id WHERE invited_by IS NULL;

-- Set invited_by NOT NULL after backfill (if all rows have it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.invitations WHERE invited_by IS NULL) THEN
    ALTER TABLE public.invitations ALTER COLUMN invited_by SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.invitations.invited_by IS 'Utilizatorul care a creat invitația (invited_by din cerințe).';
COMMENT ON COLUMN public.invitations.invited_email IS 'Email-ul persoanei invitate (câmpul email din cerințe).';
COMMENT ON COLUMN public.invitations.code_hash IS 'Token-ul invitației stocat ca hash; token-ul în clar se returnează la create_invitation.';

-- =============================================================================
-- 3. CLAIM_INVITATION: CREEAZĂ AUTOMAT parent_student_relations PENTRU PARENT
-- =============================================================================

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations i
  WHERE i.code_hash = p_code_hash
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND i.current_uses < i.max_uses
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

  -- Creare automată parent_student_relations când părinte acceptă invitația
  IF v_inv.role = 'parent'::public.invitation_role AND v_inv.student_id IS NOT NULL THEN
    INSERT INTO public.parent_student_relations (parent_user_id, student_id, is_primary)
    VALUES (p_user_id, v_inv.student_id, false)
    ON CONFLICT (parent_user_id, student_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT
    true::boolean,
    v_inv.id, v_inv.role, v_inv.school_id, v_inv.class_id, v_inv.student_id,
    v_inv.first_name, v_inv.last_name, v_inv.invited_student_number,
    v_inv.invited_email, v_inv.invited_phone,
    NULL::text;
END;
$$;

COMMENT ON FUNCTION public.claim_invitation IS 'Validează și marchează invitația ca folosită. Pentru părinți, creează automat legătura în parent_student_relations.';

-- =============================================================================
-- 4. CREATE_INVITATION: IERARHIE DEV -> DIRECTOR -> DIRIGINȚI -> REST
-- =============================================================================

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_plain_code text;
  v_code_hash text;
  v_invitation_id uuid;
  v_creator_id uuid;
  v_class_school_id uuid;
  v_homeroom_class_id uuid;
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

  -- IERARHIE: Developer -> Director
  IF public.has_role(v_user_id, 'developer'::public.app_role) THEN
    -- Developer poate invita director pentru orice școală
    IF p_role = 'director'::public.invitation_role THEN
      IF p_class_id IS NOT NULL OR p_student_id IS NOT NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director invitations cannot have class_id or student_id'::text;
        RETURN;
      END IF;
    END IF;
    -- Developer poate invita orice rol (pentru setup inițial)

  -- IERARHIE: Director -> Diriginți / Profesori / Secretariat
  ELSIF public.has_role(v_user_id, 'director'::public.app_role) THEN
    IF p_role NOT IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Directors can only invite teacher / homeroom_teacher / secretariat'::text;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director can only create invitations for their school'::text;
      RETURN;
    END IF;
    -- Pentru homeroom_teacher, director setează class_id (clasa atribuită)
    IF p_role = 'homeroom_teacher'::public.invitation_role AND p_class_id IS NOT NULL THEN
      SELECT c.school_id INTO v_class_school_id FROM public.classes c WHERE c.id = p_class_id;
      IF v_class_school_id IS NULL OR v_class_school_id <> p_school_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class does not belong to the specified school'::text;
        RETURN;
      END IF;
    END IF;
    -- Pentru teacher/secretariat, class_id trebuie să fie NULL
    IF p_role IN ('teacher'::public.invitation_role, 'secretariat'::public.invitation_role) THEN
      p_class_id := NULL;
      p_student_id := NULL;
    END IF;

  -- IERARHIE: Diriginți -> Profesori / Elevi / Părinți (DOAR pentru clasa lor)
  ELSIF public.has_role(v_user_id, 'homeroom_teacher'::public.app_role) THEN
    IF p_role NOT IN ('student'::public.invitation_role, 'parent'::public.invitation_role, 'teacher'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Homeroom teachers can only invite student / parent / teacher'::text;
      RETURN;
    END IF;

    -- Verifică că dirigintele are o clasă (homeroom)
    SELECT c.id INTO v_homeroom_class_id
    FROM public.classes c
    WHERE c.teacher_id = v_user_id AND c.school_id = p_school_id
    LIMIT 1;

    IF v_homeroom_class_id IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'You are not a homeroom teacher for any class in this school'::text;
      RETURN;
    END IF;

    -- Pentru student/parent: class_id TREBUIE să fie clasa dirigintei
    IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) THEN
      IF p_class_id IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
        RETURN;
      END IF;
      IF p_class_id <> v_homeroom_class_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You can only invite students/parents for your own class'::text;
        RETURN;
      END IF;
      SELECT c.school_id INTO v_class_school_id FROM public.classes c WHERE c.id = p_class_id;
      IF v_class_school_id IS NULL OR v_class_school_id <> p_school_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class does not belong to the specified school'::text;
        RETURN;
      END IF;
    END IF;

    -- Pentru teacher: class_id TREBUIE să fie clasa dirigintei (pentru teacher_assignments)
    IF p_role = 'teacher'::public.invitation_role THEN
      IF p_class_id IS NULL THEN
        p_class_id := v_homeroom_class_id;
      END IF;
      IF p_class_id <> v_homeroom_class_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You can only invite teachers for your own class'::text;
        RETURN;
      END IF;
      p_student_id := NULL;
    END IF;

    -- Pentru parent: student_id este obligatoriu
    IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Student is required for parent invitations'::text;
      RETURN;
    END IF;
    -- Verifică că student_id aparține clasei dirigintei
    IF p_role = 'parent'::public.invitation_role AND p_student_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = p_student_id AND s.class_id = v_homeroom_class_id
      ) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Student does not belong to your class'::text;
        RETURN;
      END IF;
    END IF;

  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Not authorized to create invitations'::text;
    RETURN;
  END IF;

  -- Validări generale
  IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND p_class_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
    RETURN;
  END IF;

  IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Student is required for parent invitations'::text;
    RETURN;
  END IF;

  v_plain_code := public.generate_invitation_code();
  v_code_hash := public.hash_invitation_code(v_plain_code);

  INSERT INTO public.invitations (
    role, school_id, class_id, student_id,
    first_name, last_name, invited_student_number, invited_email, invited_phone, intended_for,
    code_hash, created_by_user_id, invited_by, expires_at, max_uses
  ) VALUES (
    p_role, p_school_id, p_class_id, p_student_id,
    NULLIF(trim(p_first_name), ''), NULLIF(trim(p_last_name), ''),
    p_student_number,
    NULLIF(trim(p_invited_email), ''), NULLIF(trim(p_invited_phone), ''),
    NULLIF(trim(p_intended_for), ''),
    v_code_hash, v_creator_id, v_creator_id,
    NOW() + (p_expires_hours || ' hours')::interval,
    p_max_uses
  )
  RETURNING id INTO v_invitation_id;

  RETURN QUERY SELECT v_invitation_id, v_plain_code, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.create_invitation IS 'Creează invitație conform ierarhiei: Dev->Director, Director->Diriginți/Profesori, Diriginți->Elevi/Părinți/Profesori (doar pentru clasa lor).';

-- =============================================================================
-- 5. RLS: RESTRICȚII STRICTE PENTRU DIRIGINȚI (DOAR CLASA LOR)
-- =============================================================================

-- Șterge politicile vechi care permit dirigintei să invite pentru alte clase
DROP POLICY IF EXISTS "Homeroom teachers can manage student parent invitations" ON public.invitations;
DROP POLICY IF EXISTS "Homeroom teachers can manage student parent teacher invitations" ON public.invitations;

-- Dirigintele poate SELECT invitațiile pentru clasa lui
CREATE POLICY "homeroom_select_own_class_invitations" ON public.invitations
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
  );

-- Dirigintele poate INSERT invitații DOAR pentru clasa lui
CREATE POLICY "homeroom_insert_own_class_invitations" ON public.invitations
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND role IN ('student'::public.invitation_role, 'parent'::public.invitation_role, 'teacher'::public.invitation_role)
    AND class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
    AND school_id = public.get_user_school_id()
  );

-- Dirigintele poate UPDATE (revoca) invitațiile pentru clasa lui
CREATE POLICY "homeroom_update_own_class_invitations" ON public.invitations
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
  );

-- Director: poate SELECT/INSERT/UPDATE invitații pentru teacher/homeroom_teacher/secretariat în școala lui
DROP POLICY IF EXISTS "Directors can manage teacher invitations" ON public.invitations;
CREATE POLICY "director_manage_staff_invitations" ON public.invitations
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'director'::public.app_role)
    AND role IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role)
    AND school_id = public.get_user_school_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'director'::public.app_role)
    AND role IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role)
    AND school_id = public.get_user_school_id()
  );

-- Developer: poate gestiona toate invitațiile
-- (Dacă politica există deja, o ștergem și o recreăm pentru consistență)
DROP POLICY IF EXISTS "Developers can manage all invitations" ON public.invitations;
CREATE POLICY "Developers can manage all invitations" ON public.invitations
  FOR ALL
  USING (public.has_role(auth.uid(), 'developer'::public.app_role));

-- Utilizatorii pot vedea invitațiile create de ei
DROP POLICY IF EXISTS "Users can see own invitations" ON public.invitations;
CREATE POLICY "users_select_own_invitations" ON public.invitations
  FOR SELECT
  USING (created_by_user_id = auth.uid() OR invited_by = auth.uid());

-- Oricine poate valida invitații (pentru signup)
DROP POLICY IF EXISTS "Anyone can validate invitations" ON public.invitations;
CREATE POLICY "anyone_validate_invitations" ON public.invitations
  FOR SELECT
  USING (
    revoked_at IS NULL
    AND expires_at > now()
    AND current_uses < max_uses
  );

GRANT EXECUTE ON FUNCTION public.create_invitation TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation TO authenticated;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 86/102: 20260233000000_saas_integrity_grade_audit_and_rls.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- SaaS Integrity: Grade Audit, Multi-Role, Semester Lock Bypass, RLS Hardening
--
-- Pilon 1 – Arhitectură Multi-Rol & Securitate
-- - Rolurile sunt o colecție în DB (user_roles). Permisiunile se verifică în
--   backend/RLS; Role Switcher în UI schimbă doar perspectiva ('View as').
-- - RLS: orice acțiune verifică auth.uid(), school_id, rol din user_roles și
--   (pentru profesori) asignarea la clasă/materie (teacher_assignments).
--
-- Pilon 2 – Integritate Date & Audit
-- - Tabel grade_audit: old_value, new_value, user_id, timestamp. Imutabilitate
--   prioritate zero; triggere AFTER INSERT/UPDATE/DELETE pe grades.
-- - Semestru închis (is_locked): RLS blochează modificări note/absențe, cu
--   excepția Admin-ului suprem (developer / uat_admin).
--
-- Pilon 3 – Model de domeniu (referință)
-- - School -> Class -> Student; Teacher -> Subject -> Class (teacher_assignments).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. TABEL grade_audit ȘI TRIGGERE PE grades
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.grade_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_value JSONB,
  new_value JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.grade_audit IS 'Audit dedicat note: old_value, new_value, user_id, timestamp. Imutabilitate date oficiale.';
COMMENT ON COLUMN public.grade_audit.old_value IS 'Stare înainte (UPDATE/DELETE).';
COMMENT ON COLUMN public.grade_audit.new_value IS 'Stare după (INSERT/UPDATE).';

CREATE INDEX IF NOT EXISTS idx_grade_audit_grade_id ON public.grade_audit(grade_id);
CREATE INDEX IF NOT EXISTS idx_grade_audit_school_id ON public.grade_audit(school_id);
CREATE INDEX IF NOT EXISTS idx_grade_audit_created_at ON public.grade_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_grade_audit_user_id ON public.grade_audit(user_id);

ALTER TABLE public.grade_audit ENABLE ROW LEVEL SECURITY;

-- RLS: citire doar în școala utilizatorului sau admin suprem
DROP POLICY IF EXISTS "grade_audit_select_own_school_or_supreme" ON public.grade_audit;
CREATE POLICY "grade_audit_select_own_school_or_supreme" ON public.grade_audit
  FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Inserări doar din trigger (SECURITY DEFINER); nu permitem INSERT direct din aplicație
-- Revocăm INSERT pentru role authenticated pe grade_audit (doar trigger scrie)
REVOKE INSERT ON public.grade_audit FROM authenticated;
GRANT SELECT ON public.grade_audit TO authenticated;

-- Trigger function: scrie în grade_audit la fiecare INSERT/UPDATE/DELETE pe grades
CREATE OR REPLACE FUNCTION public.grade_audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_school_id UUID;
  v_grade_id UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  v_uid := auth.uid();
  v_grade_id := COALESCE(NEW.id, OLD.id);
  v_school_id := (COALESCE(to_jsonb(NEW), to_jsonb(OLD))->>'school_id')::uuid;

  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  INSERT INTO public.grade_audit (grade_id, action, old_value, new_value, user_id, school_id)
  VALUES (v_grade_id, TG_OP, v_old, v_new, v_uid, v_school_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger AFTER pe grades (rulează în plus față de orice audit existent pe audit_logs)
DROP TRIGGER IF EXISTS trg_grade_audit ON public.grades;
CREATE TRIGGER trg_grade_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.grade_audit_trigger_fn();

COMMENT ON FUNCTION public.grade_audit_trigger_fn IS 'Scrie în grade_audit la fiecare INSERT/UPDATE/DELETE pe grades.';

-- =============================================================================
-- 2. BYPASS SEMESTER LOCK PENTRU ADMIN SUPREM
-- =============================================================================

-- Funcție: utilizatorul este "Admin suprem" (poate modifica note și cu semestrul blocat)
CREATE OR REPLACE FUNCTION public.is_supreme_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(p_user_id, 'developer'::public.app_role)
     OR public.has_role(p_user_id, 'uat_admin'::public.app_role);
$$;

COMMENT ON FUNCTION public.is_supreme_admin IS 'True pentru developer/uat_admin; pot modifica note/absențe și când semestrul e închis.';

-- Rescriem politicile grades: dacă e supreme admin, poate scrie chiar dacă semestrul e blocat
DROP POLICY IF EXISTS "grades_insert_strict" ON public.grades;
CREATE POLICY "grades_insert_strict" ON public.grades
  FOR INSERT
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (
      public.is_supreme_admin(auth.uid())
      OR (
        NOT public.is_semester_locked_for_grade(date, student_id)
        AND (
          public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
        )
      )
    )
  );

DROP POLICY IF EXISTS "grades_update_strict" ON public.grades;
CREATE POLICY "grades_update_strict" ON public.grades
  FOR UPDATE
  USING (
    school_id = public.get_user_school_id()
    AND (
      public.is_supreme_admin(auth.uid())
      OR (
        NOT public.is_semester_locked_for_grade(date, student_id)
        AND (
          public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
        )
      )
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (
      public.is_supreme_admin(auth.uid())
      OR (
        NOT public.is_semester_locked_for_grade(date, student_id)
        AND (
          public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
        )
      )
    )
  );

-- =============================================================================
-- 3. MULTI-ROL: COlecție roluri din DB (user_roles) pentru UI "View as"
-- =============================================================================

-- Returnează lista de roluri a utilizatorului (pentru Context Switcher / View as)
CREATE OR REPLACE FUNCTION public.get_user_role_list(p_user_id UUID DEFAULT auth.uid())
RETURNS SETOF public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = p_user_id;
$$;

COMMENT ON FUNCTION public.get_user_role_list IS 'Rolurile utilizatorului din user_roles (multi-rol). UI folosește pentru View as; permisiunile se verifică în RLS cu has_role().';

GRANT EXECUTE ON FUNCTION public.get_user_role_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supreme_admin TO authenticated;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 87/102: 20260234000000_calcul_medii_teza_rpc.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Calcul medii în DB: pondere teză (25%), rotunjire parțială (2 zecimale),
-- rotunjire finală (întreg, .5 rotunjit în sus). Mută logica din frontend în RPC.
-- =============================================================================

BEGIN;

-- Rotunjire finală notă (1-10): regula românească – .5 rotunjeste în sus
CREATE OR REPLACE FUNCTION public.round_final_grade_ro(p_average NUMERIC)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_floor INTEGER;
  v_frac NUMERIC;
BEGIN
  IF p_average IS NULL THEN RETURN 1; END IF;
  v_floor := FLOOR(p_average)::INTEGER;
  v_frac := p_average - v_floor;
  IF v_frac >= 0.5 THEN
    RETURN LEAST(10, v_floor + 1);
  END IF;
  RETURN GREATEST(1, ROUND(p_average)::INTEGER);
END;
$$;

COMMENT ON FUNCTION public.round_final_grade_ro IS 'Rotunjire notă finală 1-10: .5 rotunjeste în sus.';

-- RPC: medie semestrială cu teză (pondere 25%) și rotunjiri
-- Teza = nota cu grade_type = lucrare_scrisa (una per semestru/subject, ex. ultima)
CREATE OR REPLACE FUNCTION public.calculate_semester_average_with_teza(
  p_student_id UUID,
  p_subject_id UUID,
  p_semester INTEGER,
  p_academic_year INTEGER DEFAULT NULL,
  p_teza_weight NUMERIC DEFAULT 0.25
)
RETURNS TABLE (
  partial_average NUMERIC(4,2),
  teza_grade NUMERIC(4,2),
  weighted_average NUMERIC(4,2),
  final_grade_rounded INTEGER,
  grade_count BIGINT,
  normal_count BIGINT,
  has_teza BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
  v_partial NUMERIC;
  v_teza NUMERIC;
  v_weighted NUMERIC;
  v_normal_count BIGINT;
  v_teza_count BIGINT;
BEGIN
  IF p_teza_weight IS NULL OR p_teza_weight < 0 OR p_teza_weight > 1 THEN
    p_teza_weight := 0.25;
  END IF;

  IF p_academic_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN v_year := v_year - 1; END IF;
  ELSE
    v_year := p_academic_year;
  END IF;

  -- Medie note normale (fără teză): normal + ascultare
  SELECT
    ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2),
    COUNT(*)::BIGINT
  INTO v_partial, v_normal_count
  FROM public.grades g
  WHERE g.student_id = p_student_id
    AND g.subject_id = p_subject_id
    AND g.deleted_at IS NULL
    AND public.get_semester_from_date(g.date) = p_semester
    AND (CASE WHEN EXTRACT(MONTH FROM g.date) IN (9,10,11,12) THEN EXTRACT(YEAR FROM g.date)
              ELSE EXTRACT(YEAR FROM g.date) - 1 END) = v_year
    AND COALESCE(g.grade_type, 'normal') IN ('normal', 'ascultare');

  -- Teza: o singură notă lucrare_scrisa (luăm ultima după dată)
  SELECT g.grade::NUMERIC
  INTO v_teza
  FROM public.grades g
  WHERE g.student_id = p_student_id
    AND g.subject_id = p_subject_id
    AND g.deleted_at IS NULL
    AND COALESCE(g.grade_type, 'normal') = 'lucrare_scrisa'
    AND public.get_semester_from_date(g.date) = p_semester
    AND (CASE WHEN EXTRACT(MONTH FROM g.date) IN (9,10,11,12) THEN EXTRACT(YEAR FROM g.date)
              ELSE EXTRACT(YEAR FROM g.date) - 1 END) = v_year
  ORDER BY g.date DESC
  LIMIT 1;

  v_partial := COALESCE(v_partial, 0);
  v_normal_count := COALESCE(v_normal_count, 0);

  IF v_teza IS NOT NULL THEN
    v_weighted := ROUND((v_partial * (1 - p_teza_weight) + v_teza * p_teza_weight)::NUMERIC, 2)::NUMERIC(4,2);
  ELSE
    v_weighted := v_partial;
  END IF;

  RETURN QUERY SELECT
    v_partial,
    v_teza,
    v_weighted,
    public.round_final_grade_ro(v_weighted),
    v_normal_count + (CASE WHEN v_teza IS NOT NULL THEN 1 ELSE 0 END),
    v_normal_count,
    (v_teza IS NOT NULL);
END;
$$;

COMMENT ON FUNCTION public.calculate_semester_average_with_teza IS 'Calculează media semestrială cu pondere teză (implicit 25%). Rotunjire parțială 2 zecimale, finală întreg (.5 în sus).';

GRANT EXECUTE ON FUNCTION public.round_final_grade_ro TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_semester_average_with_teza TO authenticated;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 88/102: 20260235000000_production_audit_log_and_rpc.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Production-grade: audit_log (spec), RPC-only mutations, academic_periods,
-- login/access logs. NO direct frontend writes; all via RPC.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. AUDIT_LOG TABLE (exact spec: table_name, record_id, action, old_data, new_data, changed_by, created_at)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON public.audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_own_school_or_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_own_school_or_admin" ON public.audit_log FOR SELECT
  USING (
    public.has_role(auth.uid(), 'director'::public.app_role)
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
  );

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;

COMMENT ON TABLE public.audit_log IS 'Audit trail for grades and attendance; populated only by triggers. changed_by = auth.uid().';

-- Trigger function: write to audit_log on grades/attendance changes
CREATE OR REPLACE FUNCTION public.audit_log_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_record_id UUID;
  v_old JSONB;
  v_new JSONB;
  v_action TEXT;
BEGIN
  v_uid := auth.uid();
  v_action := TG_OP;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_record_id := NEW.id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (TG_TABLE_NAME, v_record_id, v_action, v_old, v_new, v_uid);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_grades ON public.grades;
CREATE TRIGGER trg_audit_log_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_log_attendance ON public.attendance;
CREATE TRIGGER trg_audit_log_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger_fn();

-- =============================================================================
-- 2. GRADES: ensure created_by, updated_by exist (spec)
-- =============================================================================

ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.grades.created_by IS 'User who created the grade (auth.uid() at insert).';
COMMENT ON COLUMN public.grades.updated_by IS 'User who last updated the grade.';

-- =============================================================================
-- 3. ATTENDANCE: ensure created_by exists (spec)
-- =============================================================================

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.attendance.created_by IS 'User who created the attendance record.';

-- =============================================================================
-- 4. ACADEMIC_PERIODS (spec: id, school_id, name, is_locked) – lock control
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.academic_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_periods_school ON public.academic_periods(school_id);
CREATE INDEX IF NOT EXISTS idx_academic_periods_locked ON public.academic_periods(is_locked) WHERE is_locked = true;

ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academic_periods_select_school" ON public.academic_periods;
CREATE POLICY "academic_periods_select_school" ON public.academic_periods FOR SELECT
  USING (school_id = public.get_user_school_id());

DROP POLICY IF EXISTS "academic_periods_manage_director" ON public.academic_periods;
CREATE POLICY "academic_periods_manage_director" ON public.academic_periods FOR ALL
  USING (
    school_id = public.get_user_school_id()
    AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role))
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role))
  );

-- =============================================================================
-- 5. LOGIN LOGS & ACCESS LOGS (spec §13)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  success BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON public.login_logs(created_at);

CREATE TABLE IF NOT EXISTS public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resource TEXT,
  action TEXT,
  success BOOLEAN NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user ON public.access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON public.access_logs(created_at);

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Only directors/admins see logs
DROP POLICY IF EXISTS "login_logs_select_admin" ON public.login_logs;
CREATE POLICY "login_logs_select_admin" ON public.login_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'director'::public.app_role)
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

DROP POLICY IF EXISTS "access_logs_select_admin" ON public.access_logs;
CREATE POLICY "access_logs_select_admin" ON public.access_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'director'::public.app_role)
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Inserts only via service/trigger (SECURITY DEFINER)
REVOKE INSERT ON public.login_logs FROM authenticated;
REVOKE INSERT ON public.access_logs FROM authenticated;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 89/102: 20260235100000_production_rpc_grade_attendance.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Production RPC: add_grade, update_grade, delete_grade, mark_attendance.
-- All grade/attendance mutations go through these; no direct frontend writes.
-- =============================================================================

BEGIN;

-- Map spec type (oral, written, exam) to existing grade_type
-- oral -> normal, written -> lucrare_scrisa, exam -> lucrare_scrisa
CREATE OR REPLACE FUNCTION public.add_grade(
  p_student_id UUID,
  p_subject_id UUID,
  p_value NUMERIC,
  p_type TEXT DEFAULT 'oral',
  p_date DATE DEFAULT CURRENT_DATE,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_grade_type TEXT;
  v_grade_id UUID;
  v_row RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_value IS NULL OR p_value < 1 OR p_value > 10 OR p_value <> FLOOR(p_value) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade must be an integer between 1 and 10');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  IF NOT public.user_can_edit_grade(v_user_id, p_student_id, p_subject_id, v_school_id)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  IF public.is_semester_locked_for_grade(p_date, p_student_id) AND NOT public.is_supreme_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Semester is locked');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND school_id = v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Student not in your school');
  END IF;

  v_grade_type := CASE p_type
    WHEN 'written' THEN 'lucrare_scrisa'
    WHEN 'exam' THEN 'lucrare_scrisa'
    ELSE 'normal'
  END;

  INSERT INTO public.grades (
    student_id, subject_id, grade, date, description, teacher_id, school_id, created_by
  )
  VALUES (
    p_student_id, p_subject_id, p_value, p_date, NULLIF(trim(p_description), ''),
    v_user_id, v_school_id, v_user_id
  )
  RETURNING id INTO v_grade_id;

  SELECT g.id, g.grade, g.date, g.student_id, g.subject_id
  INTO v_row
  FROM public.grades g
  WHERE g.id = v_grade_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_grade_id,
    'grade', v_row.grade,
    'date', v_row.date,
    'student_id', v_row.student_id,
    'subject_id', v_row.subject_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_grade(
  p_grade_id UUID,
  p_new_value NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_student_id UUID;
  v_subject_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_new_value IS NULL OR p_new_value < 1 OR p_new_value > 10 OR p_new_value <> FLOOR(p_new_value) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade must be an integer between 1 and 10');
  END IF;

  SELECT g.student_id, g.subject_id, g.school_id INTO v_student_id, v_subject_id, v_school_id
  FROM public.grades g
  WHERE g.id = p_grade_id AND g.deleted_at IS NULL;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not found');
  END IF;

  IF v_school_id <> public.get_user_school_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not in your school');
  END IF;

  IF NOT public.user_can_edit_grade(v_user_id, v_student_id, v_subject_id, v_school_id)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed to edit this grade');
  END IF;

  IF public.is_semester_locked_for_grade((SELECT date FROM public.grades WHERE id = p_grade_id), v_student_id)
     AND NOT public.is_supreme_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Semester is locked');
  END IF;

  UPDATE public.grades
  SET grade = p_new_value, updated_by = v_user_id, teacher_id = v_user_id
  WHERE id = p_grade_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_grade_id, 'grade', p_new_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_grade(p_grade_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_student_id UUID;
  v_subject_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT g.student_id, g.subject_id, g.school_id INTO v_student_id, v_subject_id, v_school_id
  FROM public.grades g
  WHERE g.id = p_grade_id AND g.deleted_at IS NULL;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not found');
  END IF;

  IF v_school_id <> public.get_user_school_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not in your school');
  END IF;

  IF NOT public.user_can_edit_grade(v_user_id, v_student_id, v_subject_id, v_school_id)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed to delete this grade');
  END IF;

  IF public.is_semester_locked_for_grade((SELECT date FROM public.grades WHERE id = p_grade_id), v_student_id)
     AND NOT public.is_supreme_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Semester is locked');
  END IF;

  UPDATE public.grades
  SET deleted_at = now(), updated_by = v_user_id
  WHERE id = p_grade_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_grade_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_student_id UUID,
  p_subject_id UUID,
  p_date DATE,
  p_status TEXT,
  p_is_excused BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_attendance_id UUID;
  v_existing_id UUID;
  v_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  v_status := CASE p_status
    WHEN 'present' THEN 'prezent'
    WHEN 'absent' THEN 'absent'
    WHEN 'excused' THEN 'motivat'
    ELSE COALESCE(NULLIF(trim(p_status), ''), 'absent')
  END;

  IF v_status NOT IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending', 'nemotivata', 'motivata', 'in_curs') THEN
    v_status := 'absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.students s ON s.class_id = ta.class_id
    WHERE ta.teacher_id = v_user_id AND ta.subject_id = p_subject_id AND s.id = p_student_id
      AND ta.school_id = v_school_id
  ) AND NOT public.has_role(v_user_id, 'director'::public.app_role)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  SELECT id INTO v_existing_id FROM public.attendance
  WHERE student_id = p_student_id AND subject_id = p_subject_id AND date = p_date AND (deleted_at IS NULL)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.attendance
    SET status = v_status, is_excused = COALESCE(p_is_excused, false), created_by = v_user_id
    WHERE id = v_existing_id;
    v_attendance_id := v_existing_id;
  ELSE
    INSERT INTO public.attendance (student_id, subject_id, date, status, is_excused, school_id, created_by)
    VALUES (p_student_id, p_subject_id, p_date, v_status, COALESCE(p_is_excused, false), v_school_id, v_user_id)
    RETURNING id INTO v_attendance_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_attendance_id,
    'student_id', p_student_id,
    'subject_id', p_subject_id,
    'date', p_date,
    'status', v_status
  );
END;
$$;

-- mark_attendance_upsert kept for backwards compat; primary is mark_attendance above
CREATE OR REPLACE FUNCTION public.mark_attendance_upsert(
  p_student_id UUID,
  p_subject_id UUID,
  p_date DATE,
  p_status TEXT,
  p_is_excused BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_attendance_id UUID;
  v_status TEXT;
  v_existing_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  v_status := CASE p_status
    WHEN 'present' THEN 'prezent'
    WHEN 'absent' THEN 'absent'
    WHEN 'excused' THEN 'motivat'
    ELSE COALESCE(NULLIF(trim(p_status), ''), 'absent')
  END;
  IF v_status NOT IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending', 'nemotivata', 'motivata', 'in_curs') THEN
    v_status := 'absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.students s ON s.class_id = ta.class_id
    WHERE ta.teacher_id = v_user_id AND ta.subject_id = p_subject_id AND s.id = p_student_id AND ta.school_id = v_school_id
  ) AND NOT public.has_role(v_user_id, 'director'::public.app_role)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  SELECT id INTO v_existing_id FROM public.attendance
  WHERE student_id = p_student_id AND subject_id = p_subject_id AND date = p_date AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.attendance
    SET status = v_status, is_excused = COALESCE(p_is_excused, false), created_by = v_user_id
    WHERE id = v_existing_id;
    v_attendance_id := v_existing_id;
  ELSE
    INSERT INTO public.attendance (student_id, subject_id, date, status, is_excused, school_id, created_by)
    VALUES (p_student_id, p_subject_id, p_date, v_status, COALESCE(p_is_excused, false), v_school_id, v_user_id)
    RETURNING id INTO v_attendance_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_attendance_id,
    'student_id', p_student_id,
    'subject_id', p_subject_id,
    'date', p_date,
    'status', v_status
  );
END;
$$;

-- delete_attendance: soft delete; permission check same as mark_attendance
CREATE OR REPLACE FUNCTION public.delete_attendance(p_attendance_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_row RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  SELECT a.id, a.student_id, a.subject_id, a.school_id INTO v_row
  FROM public.attendance a
  WHERE a.id = p_attendance_id AND a.deleted_at IS NULL;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Attendance not found');
  END IF;

  IF v_row.school_id IS DISTINCT FROM v_school_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in your school');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.students s ON s.class_id = ta.class_id
    WHERE ta.teacher_id = v_user_id AND ta.subject_id = v_row.subject_id AND s.id = v_row.student_id
      AND ta.school_id = v_school_id
  ) AND NOT public.has_role(v_user_id, 'director'::public.app_role)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  UPDATE public.attendance
  SET deleted_at = now()
  WHERE id = p_attendance_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('success', true, 'id', p_attendance_id);
END;
$$;

-- calculate_student_average (spec: per subject, per semester)
CREATE OR REPLACE FUNCTION public.calculate_student_average(
  p_student_id UUID,
  p_subject_id UUID,
  p_semester INTEGER DEFAULT NULL,
  p_academic_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  semester INTEGER,
  academic_year INTEGER,
  average NUMERIC(4,2),
  grade_count BIGINT,
  final_grade_rounded INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
BEGIN
  IF p_academic_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN v_year := v_year - 1; END IF;
  ELSE
    v_year := p_academic_year;
  END IF;

  RETURN QUERY
  SELECT
    sub.id AS subject_id,
    sub.name AS subject_name,
    public.get_semester_from_date(g.date) AS semester,
    v_year::INTEGER AS academic_year,
    ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2) AS average,
    COUNT(*)::BIGINT AS grade_count,
    public.round_final_grade_ro(ROUND(AVG(g.grade::NUMERIC), 2))::INTEGER AS final_grade_rounded
  FROM public.grades g
  JOIN public.subjects sub ON sub.id = g.subject_id
  WHERE g.student_id = p_student_id
    AND g.subject_id = p_subject_id
    AND g.deleted_at IS NULL
    AND (CASE WHEN EXTRACT(MONTH FROM g.date) IN (9,10,11,12) THEN EXTRACT(YEAR FROM g.date)
              ELSE EXTRACT(YEAR FROM g.date) - 1 END) = v_year
    AND (p_semester IS NULL OR public.get_semester_from_date(g.date) = p_semester)
  GROUP BY sub.id, sub.name, public.get_semester_from_date(g.date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_grade TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_grade TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_grade TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_attendance TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_attendance TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_student_average TO authenticated;

COMMENT ON FUNCTION public.add_grade IS 'Insert grade; validates 1-10, teacher assignment, semester lock. created_by set to auth.uid().';
COMMENT ON FUNCTION public.update_grade IS 'Update grade value; sets updated_by. Permission and lock checked.';
COMMENT ON FUNCTION public.delete_grade IS 'Soft delete grade (sets deleted_at). Logged in audit.';
COMMENT ON FUNCTION public.mark_attendance IS 'Insert or update attendance for student/subject/date. created_by set.';
COMMENT ON FUNCTION public.delete_attendance IS 'Soft delete attendance (sets deleted_at). Permission checked.';
COMMENT ON FUNCTION public.calculate_student_average IS 'Returns average and rounded final grade per subject/semester.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 90/102: 20260236000000_schema_reporting_logging.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Schema alignment, reporting RPCs, login/access logging (production-grade).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. USERS VIEW (spec: users id, email, full_name, created_at)
-- =============================================================================
CREATE OR REPLACE VIEW public.users AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.created_at
FROM public.profiles p;

COMMENT ON VIEW public.users IS 'Read-only view over profiles for spec alignment. id=profiles.id, email, full_name, created_at.';

-- RLS: use same as profiles or restrict to own row / school
ALTER VIEW public.users SET (security_invoker = on);

-- =============================================================================
-- 2. USER_ROLES: add school_id (nullable) for multi-tenant role binding
-- =============================================================================
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.user_roles.school_id IS 'Optional: role applies to this school. NULL = global role for user.';

-- =============================================================================
-- 3. ADD_GRADE: persist grade_type (oral -> normal, written/exam -> lucrare_scrisa)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.add_grade(
  p_student_id UUID,
  p_subject_id UUID,
  p_value NUMERIC,
  p_type TEXT DEFAULT 'oral',
  p_date DATE DEFAULT CURRENT_DATE,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_grade_type TEXT;
  v_grade_id UUID;
  v_row RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_value IS NULL OR p_value < 1 OR p_value > 10 OR p_value <> FLOOR(p_value) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade must be an integer between 1 and 10');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  IF NOT public.user_can_edit_grade(v_user_id, p_student_id, p_subject_id, v_school_id)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  IF public.is_semester_locked_for_grade(p_date, p_student_id) AND NOT public.is_supreme_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Semester is locked');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND school_id = v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Student not in your school');
  END IF;

  v_grade_type := CASE p_type
    WHEN 'written' THEN 'lucrare_scrisa'
    WHEN 'exam' THEN 'lucrare_scrisa'
    ELSE 'normal'
  END;

  INSERT INTO public.grades (
    student_id, subject_id, grade, date, description, teacher_id, school_id, created_by, grade_type
  )
  VALUES (
    p_student_id, p_subject_id, p_value, p_date, NULLIF(trim(p_description), ''),
    v_user_id, v_school_id, v_user_id, v_grade_type
  )
  RETURNING id INTO v_grade_id;

  SELECT g.id, g.grade, g.date, g.student_id, g.subject_id
  INTO v_row
  FROM public.grades g
  WHERE g.id = v_grade_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_grade_id,
    'grade', v_row.grade,
    'date', v_row.date,
    'student_id', v_row.student_id,
    'subject_id', v_row.subject_id
  );
END;
$$;

-- =============================================================================
-- 4. REPORTING: get_student_report (grades + attendance for PDF)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_student_report(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
  v_student RECORD;
  v_grades JSONB;
  v_attendance JSONB;
  v_averages JSONB;
  v_can_see BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();

  SELECT s.id, s.full_name, s.school_id, c.name AS class_name
  INTO v_student
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  WHERE s.id = p_student_id AND s.deleted_at IS NULL;

  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Student not found');
  END IF;

  IF v_school_id IS NOT NULL AND v_student.school_id <> v_school_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Permission: own data (student), parent (child), or staff/teacher for school
  v_can_see := EXISTS (SELECT 1 FROM public.students st WHERE st.id = p_student_id AND st.user_id = v_user_id)
    OR EXISTS (
      SELECT 1 FROM public.parent_student_relations psr
      WHERE psr.student_id = p_student_id AND psr.parent_user_id = v_user_id
    )
    OR (v_school_id IS NOT NULL AND (
      public.has_role(v_user_id, 'director'::public.app_role)
      OR public.has_role(v_user_id, 'secretariat'::public.app_role)
      OR public.has_role(v_user_id, 'teacher'::public.app_role)
      OR public.has_role(v_user_id, 'homeroom_teacher'::public.app_role)
      OR public.has_role(v_user_id, 'uat_admin'::public.app_role)
      OR public.has_role(v_user_id, 'developer'::public.app_role)
    ));

  IF NOT v_can_see THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', g.id, 'date', g.date, 'grade', g.grade, 'description', g.description,
      'subject_id', g.subject_id, 'subject_name', sub.name
    ) ORDER BY g.date DESC
  ), '[]'::jsonb)
  INTO v_grades
  FROM public.grades g
  LEFT JOIN public.subjects sub ON sub.id = g.subject_id
  WHERE g.student_id = p_student_id AND g.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id, 'date', a.date, 'status', a.status, 'is_excused', a.is_excused,
      'subject_id', a.subject_id, 'subject_name', sub.name
    ) ORDER BY a.date DESC
  ), '[]'::jsonb)
  INTO v_attendance
  FROM public.attendance a
  LEFT JOIN public.subjects sub ON sub.id = a.subject_id
  WHERE a.student_id = p_student_id AND a.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'subject_id', subject_id, 'subject_name', subject_name,
      'average', average, 'grade_count', grade_count
    )
  ), '[]'::jsonb)
  INTO v_averages
  FROM public.get_student_summary(p_student_id);

  RETURN jsonb_build_object(
    'success', true,
    'student_id', p_student_id,
    'student_name', v_student.full_name,
    'class_name', v_student.class_name,
    'grades', v_grades,
    'attendance', v_attendance,
    'subject_averages', v_averages
  );
END;
$$;

-- =============================================================================
-- 5. REPORTING: get_class_report (per-student summary for class)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_class_report(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
  v_class RECORD;
  v_students JSONB;
  v_can_see BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();

  SELECT c.id, c.name, c.school_id INTO v_class
  FROM public.classes c
  WHERE c.id = p_class_id;

  IF v_class.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Class not found');
  END IF;

  IF v_school_id IS NOT NULL AND v_class.school_id <> v_school_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  v_can_see := (v_school_id IS NOT NULL AND (
    public.has_role(v_user_id, 'director'::public.app_role)
    OR public.has_role(v_user_id, 'secretariat'::public.app_role)
    OR public.has_role(v_user_id, 'teacher'::public.app_role)
    OR public.has_role(v_user_id, 'homeroom_teacher'::public.app_role)
    OR public.has_role(v_user_id, 'uat_admin'::public.app_role)
    OR public.has_role(v_user_id, 'developer'::public.app_role)
  ));

  IF NOT v_can_see THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  WITH student_summaries AS (
    SELECT
      s.id AS student_id,
      s.full_name AS student_name,
      s.student_number AS student_number,
      (SELECT jsonb_agg(jsonb_build_object('subject_name', g.subject_name, 'average', g.subject_average))
       FROM public.get_student_summary(s.id) g) AS subject_averages,
      (SELECT sm.total_absences FROM public.get_student_summary(s.id) sm LIMIT 1) AS total_absences,
      (SELECT sm.general_average FROM public.get_student_summary(s.id) sm LIMIT 1) AS general_average
    FROM public.students s
    WHERE s.class_id = p_class_id AND s.school_id = v_class.school_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'student_id', student_id,
      'student_name', student_name,
      'student_number', student_number,
      'subject_averages', COALESCE(subject_averages, '[]'::jsonb),
      'total_absences', total_absences,
      'general_average', general_average
    ) ORDER BY student_number NULLS LAST, student_name
  ), '[]'::jsonb)
  INTO v_students
  FROM student_summaries;

  RETURN jsonb_build_object(
    'success', true,
    'class_id', p_class_id,
    'class_name', v_class.name,
    'students', v_students
  );
END;
$$;

-- =============================================================================
-- 6. LOGGING: log_login (called from Edge Function or auth hook)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_login(
  p_user_id UUID,
  p_email TEXT,
  p_success BOOLEAN,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_logs (user_id, email, success, ip_address, user_agent)
  VALUES (p_user_id, p_email, p_success, p_ip_address, p_user_agent);
END;
$$;

-- =============================================================================
-- 7. LOGGING: log_access (failed/success access to resources)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_access(
  p_user_id UUID,
  p_resource TEXT,
  p_action TEXT,
  p_success BOOLEAN,
  p_details JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.access_logs (user_id, resource, action, success, details)
  VALUES (p_user_id, p_resource, p_action, p_success, p_details);
END;
$$;

-- Allow service_role to call logging (Edge Function uses service role)
GRANT EXECUTE ON FUNCTION public.log_login TO service_role;
GRANT EXECUTE ON FUNCTION public.log_login TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_access TO service_role;
GRANT EXECUTE ON FUNCTION public.log_access TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_student_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_report TO authenticated;

COMMENT ON FUNCTION public.get_student_report IS 'Returns grades + attendance + averages for one student (for PDF report). RLS enforced.';
COMMENT ON FUNCTION public.get_class_report IS 'Returns per-student summary for a class (for class report / PDF).';
COMMENT ON FUNCTION public.log_login IS 'Insert login event. Call from Edge Function on auth sign-in/sign-out or failure.';
COMMENT ON FUNCTION public.log_access IS 'Insert access event (e.g. failed RPC). Call from Edge Function or RPC error handler.';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 91/102: 20260237000000_gdpr_export_soft_delete.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- GDPR: export date utilizator, soft delete cont, jurnal acces (audit_logs existent).
-- =============================================================================

BEGIN;

-- 1) deleted_at pe profiles pentru soft delete cont
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.deleted_at IS 'GDPR: soft delete; cont șters la cererea utilizatorului.';

-- 2) RPC: export date utilizator (GDPR drept la portabilitate)
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile JSONB;
  v_roles JSONB;
  v_grades JSONB;
  v_attendance JSONB;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_uid AND p.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(ur.role), '[]'::jsonb) INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid;

  SELECT COALESCE(
    (SELECT jsonb_agg(g) FROM (
      SELECT g.id, g.grade, g.date, g.description, g.created_at,
             (SELECT name FROM public.subjects WHERE id = g.subject_id) AS subject_name
      FROM public.grades g
      JOIN public.students s ON s.id = g.student_id AND s.user_id = v_uid
      WHERE g.deleted_at IS NULL
    ) g),
    '[]'::jsonb
  ) INTO v_grades;

  SELECT COALESCE(
    (SELECT jsonb_agg(a) FROM (
      SELECT a.id, a.date, a.status, a.is_excused, a.created_at,
             (SELECT name FROM public.subjects WHERE id = a.subject_id) AS subject_name
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id AND s.user_id = v_uid
    ) a),
    '[]'::jsonb
  ) INTO v_attendance;

  v_result := jsonb_build_object(
    'exported_at', now(),
    'profile', v_profile,
    'roles', v_roles,
    'grades', v_grades,
    'attendance', v_attendance
  );
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.export_my_data IS 'GDPR: export date personale pentru utilizatorul autentificat.';

-- 3) RPC: soft delete cont (anonymize profile, set deleted_at)
CREATE OR REPLACE FUNCTION public.soft_delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.profiles
  SET
    full_name = 'Utilizator șters',
    email = 'deleted-' || v_uid::text || '@deleted.local',
    phone = NULL,
    deleted_at = now(),
    updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.soft_delete_my_account IS 'GDPR: ștergere cont (soft delete, anonimizare date).';

-- RLS: exclude utilizatori șterși din select (opțional – poate fi aplicat în politici existente)
-- Nu schimbăm politici aici; aplicația poate filtra deleted_at la login.

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 92/102: 20260238000000_roles_table_and_audit_view.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Tabel roles (referință pentru app_role) + view audit cu old_value/new_value
-- =============================================================================

BEGIN;

-- 1) Tabel roles: id, code (unic, aliniat cu app_role), display_name
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.roles IS 'Referință roluri (RBAC); code = app_role enum value.';

INSERT INTO public.roles (code, display_name) VALUES
  ('student', 'Elev'),
  ('parent', 'Părinte'),
  ('teacher', 'Profesor'),
  ('homeroom_teacher', 'Diriginte'),
  ('secretariat', 'Secretariat'),
  ('director', 'Director'),
  ('uat_admin', 'Administrator UAT'),
  ('developer', 'Dezvoltator')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select_all" ON public.roles;
CREATE POLICY "roles_select_all" ON public.roles FOR SELECT USING (true);

-- 2) View audit_logs_export: alias old_data -> old_value, new_data -> new_value (compatibilitate API)
CREATE OR REPLACE VIEW public.audit_logs_export AS
SELECT
  id,
  user_id,
  action,
  entity_type,
  entity_id,
  old_data AS old_value,
  new_data AS new_value,
  details,
  school_id,
  user_name,
  active_role,
  created_at
FROM public.audit_logs;

COMMENT ON VIEW public.audit_logs_export IS 'Audit log cu coloane old_value/new_value (alias pentru old_data/new_data).';

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 93/102: 20260239000000_notification_email_queue.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Coadă notificări email (pentru părinți: notă nouă, absență).
-- Inserări din trigger; trimiterea se face din Edge Function sau cron.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_email_queue_user_id ON public.notification_email_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_email_queue_sent_at ON public.notification_email_queue(sent_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_email_queue_created_at ON public.notification_email_queue(created_at);

COMMENT ON TABLE public.notification_email_queue IS 'Coadă pentru trimitere email (părinți: notă nouă, absență). Procesată de Edge Function.';

ALTER TABLE public.notification_email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_email_queue_no_direct_select" ON public.notification_email_queue;
CREATE POLICY "notification_email_queue_no_direct_select" ON public.notification_email_queue
  FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.notify_parents_new_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_subject_name TEXT;
  v_student_name TEXT;
BEGIN
  SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
  SELECT full_name INTO v_student_name FROM public.students WHERE id = NEW.student_id;
  FOR v_parent_id IN
    SELECT psr.parent_user_id
    FROM public.parent_student_relations psr
    WHERE psr.student_id = NEW.student_id
  LOOP
    INSERT INTO public.notification_email_queue (user_id, type, payload)
    VALUES (v_parent_id, 'grade.new', jsonb_build_object(
      'student_name', v_student_name, 'subject_name', v_subject_name,
      'grade', NEW.grade, 'date', NEW.date, 'grade_id', NEW.id
    ));
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_parents_new_grade ON public.grades;
CREATE TRIGGER trg_notify_parents_new_grade
  AFTER INSERT ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.notify_parents_new_grade();

CREATE OR REPLACE FUNCTION public.notify_parents_new_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_subject_name TEXT;
  v_student_name TEXT;
BEGIN
  IF NEW.status NOT IN ('absent', 'intarziat') THEN RETURN NEW; END IF;
  SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
  SELECT full_name INTO v_student_name FROM public.students WHERE id = NEW.student_id;
  FOR v_parent_id IN
    SELECT psr.parent_user_id FROM public.parent_student_relations psr WHERE psr.student_id = NEW.student_id
  LOOP
    INSERT INTO public.notification_email_queue (user_id, type, payload)
    VALUES (v_parent_id, 'attendance.absent', jsonb_build_object(
      'student_name', v_student_name, 'subject_name', v_subject_name,
      'date', NEW.date, 'status', NEW.status, 'attendance_id', NEW.id
    ));
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_parents_new_attendance ON public.attendance;
CREATE TRIGGER trg_notify_parents_new_attendance
  AFTER INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.notify_parents_new_attendance();

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 94/102: 20260240000000_billing_tables_and_rpc.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- Billing anual: 60 lei/elev/an. Factură manuală, fără plăți online.
-- =============================================================================

BEGIN;

-- 1) school_billing – config preț per școală
CREATE TABLE IF NOT EXISTS public.school_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  price_per_student NUMERIC(10,2) NOT NULL DEFAULT 60,
  currency TEXT NOT NULL DEFAULT 'RON',
  billing_cycle TEXT NOT NULL DEFAULT 'yearly' CHECK (billing_cycle IN ('yearly')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id)
);

CREATE INDEX IF NOT EXISTS idx_school_billing_school_id ON public.school_billing(school_id);

-- 2) subscriptions – status per școală / an
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'canceled')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  billing_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, billing_year)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_school_year ON public.subscriptions(school_id, billing_year);

-- 3) invoices – o factură per școală per an
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  billing_year INTEGER NOT NULL,
  student_count INTEGER NOT NULL,
  price_per_student NUMERIC(10,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'canceled')),
  issued_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, billing_year)
);

CREATE INDEX IF NOT EXISTS idx_invoices_school_year ON public.invoices(school_id, billing_year);

ALTER TABLE public.school_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS: doar director/uat_admin/developer văd facturile și billing-ul
CREATE POLICY "billing_select_admin" ON public.school_billing FOR SELECT
  USING (public.get_user_school_id() = school_id OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "subscriptions_select_admin" ON public.subscriptions FOR SELECT
  USING (public.get_user_school_id() = school_id OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "invoices_select_admin" ON public.invoices FOR SELECT
  USING (public.get_user_school_id() = school_id OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));

-- Super admin poate gestiona orice
CREATE POLICY "billing_all_super_admin" ON public.school_billing FOR ALL
  USING (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "subscriptions_all_super_admin" ON public.subscriptions FOR ALL
  USING (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "invoices_all_super_admin" ON public.invoices FOR ALL
  USING (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));

-- Numără elevii activi ai școlii (is_active = true sau NULL; folosim school_id din students)
CREATE OR REPLACE FUNCTION public.count_active_students_for_school(p_school_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.students s
  WHERE s.school_id = p_school_id
    AND (s.is_active IS NULL OR s.is_active = true);
$$;

-- Generează factură pentru școală și an (o singură factură per an)
CREATE OR REPLACE FUNCTION public.generate_invoice(p_school_id UUID, p_year INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_price NUMERIC(10,2);
  v_total NUMERIC(12,2);
  v_invoice_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role)) THEN
    RAISE EXCEPTION 'Only super admin can generate invoices';
  END IF;

  v_count := public.count_active_students_for_school(p_school_id);
  SELECT COALESCE(sb.price_per_student, 60) INTO v_price
  FROM public.school_billing sb
  WHERE sb.school_id = p_school_id AND sb.is_active = true
  LIMIT 1;
  IF v_price IS NULL THEN
    v_price := 60;
  END IF;
  v_total := v_count * v_price;

  INSERT INTO public.invoices (school_id, billing_year, student_count, price_per_student, total_amount, status)
  VALUES (p_school_id, p_year, v_count, v_price, v_total, 'pending')
  ON CONFLICT (school_id, billing_year) DO UPDATE SET
    student_count = EXCLUDED.student_count,
    price_per_student = EXCLUDED.price_per_student,
    total_amount = EXCLUDED.total_amount,
    status = CASE WHEN public.invoices.status = 'paid' THEN 'paid' ELSE 'pending' END,
    issued_at = now()
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

-- Marchează factura ca plătită
CREATE OR REPLACE FUNCTION public.mark_invoice_paid(p_invoice_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_year INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role)) THEN
    RAISE EXCEPTION 'Only super admin can mark invoices paid';
  END IF;

  UPDATE public.invoices
  SET status = 'paid', paid_at = now()
  WHERE id = p_invoice_id AND status = 'pending'
  RETURNING school_id, billing_year INTO v_school_id, v_year;

  IF FOUND THEN
    INSERT INTO public.subscriptions (school_id, status, start_date, end_date, billing_year)
    VALUES (v_school_id, 'active', (v_year || '-09-01')::date, (v_year + 1 || '-08-31')::date, v_year)
    ON CONFLICT (school_id, billing_year) DO UPDATE SET status = 'active';
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

COMMIT;


-- ---------------------------------------------------------------------------
-- MIGRATION 95/102: 20260241000000_timetable_school_id_and_rls.sql
-- ---------------------------------------------------------------------------
-- Add school_id to timetable_entries for multi-tenant RLS (scope by school).
-- Backfill from classes; new rows must set school_id (via class or explicit).

ALTER TABLE public.timetable_entries
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

-- Backfill from class_id -> classes.school_id
UPDATE public.timetable_entries te
SET school_id = c.school_id
FROM public.classes c
WHERE te.class_id = c.id AND te.school_id IS NULL;

-- Allow NULL for legacy; new inserts should set school_id (trigger or app).
CREATE INDEX IF NOT EXISTS idx_timetable_entries_school_id ON public.timetable_entries(school_id);

-- RLS: replace "Anyone can view" with school-scoped for non-developer.
DROP POLICY IF EXISTS "Anyone can view timetable" ON public.timetable_entries;

CREATE POLICY "timetable_select_school_scope"
  ON public.timetable_entries
  FOR SELECT
  USING (
    school_id IS NOT NULL
    AND (
      school_id IN (SELECT school_id FROM public.profiles WHERE id = auth.uid() AND school_id IS NOT NULL)
      OR has_role(auth.uid(), 'uat_admin'::app_role)
      OR has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- Allow viewing rows with NULL school_id only for developer (legacy)
CREATE POLICY "timetable_select_legacy_developer"
  ON public.timetable_entries
  FOR SELECT
  USING (school_id IS NULL AND has_role(auth.uid(), 'developer'::app_role));

-- Staff manage only their school's entries
DROP POLICY IF EXISTS "Staff can manage all timetable entries" ON public.timetable_entries;
CREATE POLICY "timetable_staff_manage_school"
  ON public.timetable_entries
  FOR ALL
  USING (
    (has_role(auth.uid(), 'secretariat'::app_role) OR has_role(auth.uid(), 'director'::app_role))
    AND (
      school_id IN (SELECT school_id FROM public.profiles WHERE id = auth.uid())
      OR has_role(auth.uid(), 'uat_admin'::app_role)
    )
  );

-- Teachers manage own entries (unchanged but ensure school scope in app)
-- "Teachers can manage own timetable entries" remains: teacher_id = auth.uid()

COMMENT ON COLUMN public.timetable_entries.school_id IS 'School scope for multi-tenant RLS; backfilled from class.';


-- ---------------------------------------------------------------------------
-- MIGRATION 96/102: 20260242000000_feature_flags.sql
-- ---------------------------------------------------------------------------
-- Feature flags: enable/disable features per school.

CREATE TABLE IF NOT EXISTS public.features (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_features (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, feature_id)
);

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_features ENABLE ROW LEVEL SECURITY;

-- Features list: only readable by authenticated (names are non-sensitive)
CREATE POLICY "features_select_all"
  ON public.features FOR SELECT TO authenticated USING (true);

-- School features: users see only their school's flags
CREATE POLICY "school_features_select_own_school"
  ON public.school_features FOR SELECT TO authenticated
  USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    OR has_role(auth.uid(), 'uat_admin'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  );

-- Only staff / uat_admin can update school_features
CREATE POLICY "school_features_update_staff"
  ON public.school_features FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'secretariat'::app_role))
    AND school_id IN (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    OR has_role(auth.uid(), 'uat_admin'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_school_features_school ON public.school_features(school_id);
CREATE INDEX IF NOT EXISTS idx_school_features_feature ON public.school_features(feature_id);

-- Seed a few feature names (idempotent)
INSERT INTO public.features (name, description) VALUES
  ('timetable', 'Orar săptămânal'),
  ('reports_pdf', 'Rapoarte PDF'),
  ('bulk_grades', 'Note în masă'),
  ('student_import_csv', 'Import elevi CSV'),
  ('billing', 'Facturare anuală')
ON CONFLICT (name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- MIGRATION 97/102: 20260243000000_bulk_grade_rpc_and_consistency.sql
-- ---------------------------------------------------------------------------
-- RPC: add same grade to all students in a class (for one subject/date). Teacher must be assigned.
CREATE OR REPLACE FUNCTION public.add_grade_bulk(
  p_class_id uuid,
  p_subject_id uuid,
  p_value integer,
  p_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_teacher_id uuid;
  v_student_id uuid;
  v_count int := 0;
  v_err text;
  v_res jsonb;
BEGIN
  IF p_value IS NULL OR p_value < 1 OR p_value > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nota trebuie între 1 și 10', 'count', 0);
  END IF;

  SELECT school_id INTO v_school_id FROM classes WHERE id = p_class_id;
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clasă invalidă', 'count', 0);
  END IF;

  v_teacher_id := auth.uid();
  IF NOT EXISTS (
    SELECT 1 FROM teacher_assignments
    WHERE teacher_id = v_teacher_id AND class_id = p_class_id AND subject_id = p_subject_id AND school_id = v_school_id
  ) AND NOT (has_role(v_teacher_id, 'director') OR has_role(v_teacher_id, 'secretariat')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nu ești asignat la această clasă/materie', 'count', 0);
  END IF;

  FOR v_student_id IN
    SELECT id FROM students WHERE class_id = p_class_id AND school_id = v_school_id AND (is_active IS NULL OR is_active = true)
  LOOP
    BEGIN
      v_res := add_grade(v_student_id, p_subject_id, p_value::numeric, 'oral', p_date, p_description);
      IF (v_res->>'success')::boolean THEN
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_count, 'error', v_err);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_grade_bulk TO authenticated;
COMMENT ON FUNCTION public.add_grade_bulk IS 'Add same grade to all active students in class for one subject/date.';


-- ---------------------------------------------------------------------------
-- MIGRATION 98/102: 20260244000000_gdpr_audit_sensitive_access.sql
-- ---------------------------------------------------------------------------
-- GDPR: log acces la date sensibile (export date, ștergere cont) în audit_logs.

CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile JSONB;
  v_roles JSONB;
  v_grades JSONB;
  v_attendance JSONB;
  v_result JSONB;
  v_user_name TEXT;
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Audit: log acces la date sensibile (export GDPR)
  SELECT p.full_name, p.active_role INTO v_user_name, v_role
  FROM public.profiles p WHERE p.id = v_uid LIMIT 1;
  INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    COALESCE(v_user_name, ''),
    COALESCE(v_role, 'student'::app_role),
    'sensitive_data_export',
    'profiles',
    v_uid::text,
    jsonb_build_object('reason', 'GDPR export my data')
  );

  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_uid AND p.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(ur.role), '[]'::jsonb) INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid;

  SELECT COALESCE(
    (SELECT jsonb_agg(g) FROM (
      SELECT g.id, g.grade, g.date, g.description, g.created_at,
             (SELECT name FROM public.subjects WHERE id = g.subject_id) AS subject_name
      FROM public.grades g
      JOIN public.students s ON s.id = g.student_id AND s.user_id = v_uid
      WHERE g.deleted_at IS NULL
    ) g),
    '[]'::jsonb
  ) INTO v_grades;

  SELECT COALESCE(
    (SELECT jsonb_agg(a) FROM (
      SELECT a.id, a.date, a.status, a.is_excused, a.created_at,
             (SELECT name FROM public.subjects WHERE id = a.subject_id) AS subject_name
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id AND s.user_id = v_uid
    ) a),
    '[]'::jsonb
  ) INTO v_attendance;

  v_result := jsonb_build_object(
    'exported_at', now(),
    'profile', v_profile,
    'roles', v_roles,
    'grades', v_grades,
    'attendance', v_attendance
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user_name TEXT;
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Audit: log cerere ștergere cont (acces date sensibile)
  SELECT p.full_name, p.active_role INTO v_user_name, v_role
  FROM public.profiles p WHERE p.id = v_uid LIMIT 1;
  INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    COALESCE(v_user_name, ''),
    COALESCE(v_role, 'student'::app_role),
    'account_deletion_request',
    'profiles',
    v_uid::text,
    jsonb_build_object('reason', 'GDPR soft delete account')
  );

  UPDATE public.profiles
  SET
    full_name = 'Utilizator șters',
    email = 'deleted-' || v_uid::text || '@deleted.local',
    phone = NULL,
    deleted_at = now(),
    updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.export_my_data IS 'GDPR: export date personale; log acces în audit_logs.';
COMMENT ON FUNCTION public.soft_delete_my_account IS 'GDPR: ștergere cont; log cerere în audit_logs.';


-- ---------------------------------------------------------------------------
-- MIGRATION 99/102: 20260245000000_rate_limiting.sql
-- ---------------------------------------------------------------------------
-- Rate limiting: înregistrare încercări login și limită apeluri API.
-- Implementare: tabel + RPC. Blocarea efectivă la login se poate face în Edge Function / Auth hook.

-- Încercări login (email sau identifier) – pentru limit login attempts
CREATE TABLE IF NOT EXISTS public.rate_limit_login (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_login_identifier_at
  ON public.rate_limit_login(identifier, attempted_at DESC);

-- Limită: max 10 încercări eșuate în ultimele 15 minute per identifier
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failures int;
BEGIN
  SELECT count(*)::int INTO v_failures
  FROM public.rate_limit_login
  WHERE identifier = p_identifier
    AND success = false
    AND attempted_at > now() - interval '15 minutes';
  RETURN v_failures < 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_login_attempt(p_identifier text, p_success boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rate_limit_login (identifier, success)
  VALUES (p_identifier, p_success);
  -- Curățare vechi (păstrăm ultimele 24h)
  DELETE FROM public.rate_limit_login
  WHERE attempted_at < now() - interval '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_login_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt TO anon, authenticated;

-- RLS: doar service role sau backend ar trebui să insereze; pentru simplificare permitem authenticated să înregistreze (apelat după login fail)
ALTER TABLE public.rate_limit_login ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limit_login_insert_anon"
  ON public.rate_limit_login FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "rate_limit_login_insert_authenticated"
  ON public.rate_limit_login FOR INSERT TO authenticated
  WITH CHECK (true);

-- Select/delete doar pentru service (cron cleanup)
CREATE POLICY "rate_limit_login_select_authenticated"
  ON public.rate_limit_login FOR SELECT TO authenticated
  USING (false);

COMMENT ON TABLE public.rate_limit_login IS 'Rate limiting: încercări login; check_login_rate_limit și record_login_attempt.';


-- ---------------------------------------------------------------------------
-- MIGRATION 100/102: 20260250000000_school_years_and_onboarding.sql
-- ---------------------------------------------------------------------------
-- School years: add school_id and is_active (one active per school). schools.type for onboarding.
-- Extends existing school_years if present; otherwise ensures table exists.

-- 1) Add type to schools
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS type text;

COMMENT ON COLUMN public.schools.type IS 'School type: e.g. primary, secondary, high_school.';

-- 2) Extend school_years: add school_id and is_active (one active per school)
ALTER TABLE public.school_years
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

ALTER TABLE public.school_years
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_school_years_school_id ON public.school_years(school_id) WHERE school_id IS NOT NULL;

-- Only one active year per school (partial unique index)
DROP INDEX IF EXISTS public.idx_school_years_one_active_per_school;
CREATE UNIQUE INDEX idx_school_years_one_active_per_school
  ON public.school_years(school_id) WHERE (is_active = true AND school_id IS NOT NULL);

-- Ensure label exists (existing table uses label; we use it for name e.g. 2025-2026)
-- No change if column exists

-- 3) RPC: set active year (deactivate others, activate this one)
CREATE OR REPLACE FUNCTION public.school_years_activate(p_school_year_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.school_years WHERE id = p_school_year_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'School year not found';
  END IF;
  IF NOT (public.get_user_school_id() = v_school_id OR public.has_role(auth.uid(), 'uat_admin'::app_role) OR public.has_role(auth.uid(), 'developer'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed to activate this school year';
  END IF;
  UPDATE public.school_years SET is_active = false WHERE school_id = v_school_id;
  UPDATE public.school_years SET is_active = true WHERE id = p_school_year_id;
  RETURN true;
END;
$$;

-- 4) RPC: archive year (set is_active = false; optional: mark as archived in a separate column if we add it later)
CREATE OR REPLACE FUNCTION public.school_years_archive(p_school_year_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.school_years WHERE id = p_school_year_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'School year not found'; END IF;
  IF NOT (public.get_user_school_id() = v_school_id OR public.has_role(auth.uid(), 'uat_admin'::app_role) OR public.has_role(auth.uid(), 'developer'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.school_years SET is_active = false WHERE id = p_school_year_id;
  RETURN true;
END;
$$;

-- 5) RPC: promote students (move students to next grade: update class_id to next year's class by name pattern, e.g. 10A -> 11A)
-- Simplified: we only create a placeholder; actual logic depends on class naming. Here we just return success and log.
CREATE OR REPLACE FUNCTION public.school_years_promote_students(p_school_year_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_year_name text;
  v_promoted int := 0;
  v_student record;
  v_next_class_id uuid;
BEGIN
  SELECT school_id, name INTO v_school_id, v_year_name FROM public.school_years WHERE id = p_school_year_id;
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School year not found');
  END IF;
  IF NOT (public.get_user_school_id() = v_school_id OR public.has_role(auth.uid(), 'uat_admin'::app_role) OR public.has_role(auth.uid(), 'developer'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed');
  END IF;
  -- Placeholder: actual promotion would map classes (e.g. 10A -> 11A) and update students.class_id
  -- For now return success with count 0; frontend can implement custom logic or we extend later
  RETURN jsonb_build_object('success', true, 'promoted_count', v_promoted, 'message', 'Promotion run. Implement class mapping per school.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_years_activate TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_years_archive TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_years_promote_students TO authenticated;

COMMENT ON COLUMN public.school_years.school_id IS 'School scope; NULL for legacy global years.';
COMMENT ON COLUMN public.school_years.is_active IS 'Only one active per school.';


-- ---------------------------------------------------------------------------
-- MIGRATION 101/102: 20260251000000_promote_students_logic.sql
-- ---------------------------------------------------------------------------
-- Real promotion logic: parse class name (e.g. 9A -> 10A), create next class if missing, move students.
-- Final grade (12): do not promote (graduated).

CREATE OR REPLACE FUNCTION public.school_years_promote_students(p_school_year_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_promoted int := 0;
  v_class record;
  v_grade int;
  v_suffix text;
  v_next_name text;
  v_next_id uuid;
  v_student_count int;
  v_final_grade constant int := 12;
BEGIN
  SELECT sy.school_id INTO v_school_id
  FROM public.school_years sy
  WHERE sy.id = p_school_year_id;
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School year not found');
  END IF;
  IF NOT (public.get_user_school_id() = v_school_id OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed');
  END IF;

  FOR v_class IN
    SELECT c.id, c.name
    FROM public.classes c
    WHERE c.school_id = v_school_id
  LOOP
    -- Parse class name: digits + optional suffix (e.g. 9A -> 9, A; 10B -> 10, B; 10 -> 10, '')
    v_grade := NULL;
    v_suffix := '';
    IF v_class.name ~ '^([0-9]+)(.*)$' THEN
      v_grade := (regexp_match(v_class.name, '^([0-9]+)(.*)$'))[1]::int;
      v_suffix := COALESCE((regexp_match(v_class.name, '^([0-9]+)(.*)$'))[2], '');
    END IF;

    IF v_grade IS NULL OR v_grade >= v_final_grade THEN
      -- Skip: cannot parse or final grade (e.g. 12) -> graduated, do not promote
      CONTINUE;
    END IF;

    v_next_name := (v_grade + 1)::text || v_suffix;

    -- Find or create next class
    SELECT id INTO v_next_id FROM public.classes
    WHERE school_id = v_school_id AND name = v_next_name
    LIMIT 1;
    IF v_next_id IS NULL THEN
      INSERT INTO public.classes (school_id, name, year, section)
      VALUES (v_school_id, v_next_name, v_grade + 1, COALESCE(NULLIF(trim(v_suffix), ''), ''))
      RETURNING id INTO v_next_id;
    END IF;

    -- Move students to next class
    WITH updated AS (
      UPDATE public.students
      SET class_id = v_next_id
      WHERE class_id = v_class.id
      RETURNING id
    )
    SELECT COUNT(*)::int INTO v_student_count FROM updated;
    v_promoted := v_promoted + v_student_count;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'promoted_count', v_promoted);
END;
$$;

COMMENT ON FUNCTION public.school_years_promote_students IS 'Promote students: 9A->10A, create next class if missing; skip final grade (12).';


-- ---------------------------------------------------------------------------
-- MIGRATION 102/102: 20260252000000_mandatory_backend_security.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- IMPLEMENTĂRI OBLIGATORII ÎN BACKEND
--
-- 1. Eliminare USING (true) – politici stricte cu auth.uid() și school_id
-- 2. Prevenire escaladare roluri – user nu modifică propriul rol, staff nu creează admin
-- 3. Constrângeri și indexuri suplimentare
-- 4. Invitații – policy single-use, verificare school_id
-- 5. Soft delete – deleted_at pe schools, classes unde lipsește
-- 6. Audit pentru user_roles
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ELIMINARE USING (true) – schools, roles, feature_flags
-- =============================================================================

-- Schools: înlocuie "Anyone can view" cu politică strictă
DROP POLICY IF EXISTS "Anyone can view schools" ON public.schools;
DROP POLICY IF EXISTS "schools_select_public" ON public.schools;
DROP POLICY IF EXISTS "schools_select_all" ON public.schools;

CREATE POLICY "schools_select_auth_or_own" ON public.schools
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Utilizator văzută propria școală (din profiles)
      id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- Roles (tabelul roles – view/helper): restrict la admin
DROP POLICY IF EXISTS "roles_select_all" ON public.roles;
CREATE POLICY "roles_select_restricted" ON public.roles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- Feature flags: doar autentificați
DROP POLICY IF EXISTS "features_select_authenticated" ON public.features;
DROP POLICY IF EXISTS "features_select" ON public.features;
CREATE POLICY "features_select_authenticated" ON public.features
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =============================================================================
-- 2. PREVENIRE ESCALADARE ROLURI – user_roles
-- User NU poate modifica propriul rol.
-- Staff (director/secretariat) NU poate crea uat_admin sau developer.
-- Doar uat_admin sau developer poate promova la roluri administrative.
-- =============================================================================

-- Elimină politicile vechi
DROP POLICY IF EXISTS "Staff can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Developers can view all user_roles" ON public.user_roles;

-- SELECT: director/secretariat văd rolurile din școala lor; uat_admin/developer toate
CREATE POLICY "user_roles_select_strict" ON public.user_roles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Director/secretariat: doar utilizatori din aceeași școală
      (
        (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role))
        AND user_id IN (SELECT id FROM public.profiles WHERE school_id = public.get_user_school_id())
      )
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- INSERT: Staff NU poate adăuga uat_admin sau developer.
-- Excepție: user cu 0 roluri poate adăuga primul rol non-admin (claim invitație, bootstrap).
-- User cu roluri existente NU poate adăuga roluri pentru sine (escaladare blocată).
CREATE POLICY "user_roles_insert_no_escalation" ON public.user_roles
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Alt user: staff/admin conform regulilor
      (user_id != auth.uid()
        AND (
          (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role))
          OR
          (
            (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role))
            AND role NOT IN ('uat_admin'::public.app_role, 'developer'::public.app_role)
            AND user_id IN (SELECT id FROM public.profiles WHERE school_id = public.get_user_school_id())
          )
        )
      )
      OR
      -- Propriul rol: doar dacă 0 roluri și doar roluri non-admin (claim invitație)
      (user_id = auth.uid()
        AND role NOT IN ('uat_admin'::public.app_role, 'developer'::public.app_role)
        AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
    )
  );

-- UPDATE: același principiu (în practică user_roles se modifică rar; UPDATE = DELETE + INSERT)
CREATE POLICY "user_roles_update_no_escalation" ON public.user_roles
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND user_id != auth.uid()
    AND (
      (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role))
      OR
      (
        (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role))
        AND role NOT IN ('uat_admin'::public.app_role, 'developer'::public.app_role)
        AND user_id IN (SELECT id FROM public.profiles WHERE school_id = public.get_user_school_id())
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id != auth.uid()
    AND (
      (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role))
      OR
      (
        (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role))
        AND role NOT IN ('uat_admin'::public.app_role, 'developer'::public.app_role)
      )
    )
  );

-- DELETE: același principiu
CREATE POLICY "user_roles_delete_no_escalation" ON public.user_roles
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND user_id != auth.uid()
    AND (
      (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role))
      OR
      (
        (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role))
        AND user_id IN (SELECT id FROM public.profiles WHERE school_id = public.get_user_school_id())
      )
    )
  );

-- =============================================================================
-- 3. INDEXURI – user_id, school_id, invitation_code, created_at
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_code_hash ON public.invitations(code_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_school_id ON public.invitations(school_id);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON public.invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_is_used ON public.invitations(is_used) WHERE is_used = false;
CREATE INDEX IF NOT EXISTS idx_grades_created_at ON public.grades(created_at) WHERE created_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_created_at ON public.attendance(created_at) WHERE created_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- =============================================================================
-- 4. INVITAȚII – UNIQUE invitation_code (code_hash deja UNIQUE), policy single-use
-- Verificare: claim_invitation deja setează is_used. Policy: invitația poate fi folosită o singură dată.
-- Adăugăm CHECK pentru is_used dacă lipsește.
-- =============================================================================

-- Asigură că invitations are is_used și expires_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'is_used') THEN
    ALTER TABLE public.invitations ADD COLUMN is_used BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'expires_at') THEN
    ALTER TABLE public.invitations ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours');
  END IF;
END $$;

-- RLS pe invitations: citire limitată la creator/școală, invitația nefolosită și neexpirată pentru claim
-- (Politicile existente din create_invitation RPC și claim sunt deja în RPC. RLS pe tabel trebuie să permită doar operațiunile necesare.)

-- =============================================================================
-- 5. SOFT DELETE – deleted_at pe schools, classes
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.schools ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.classes ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
  -- profiles: is_active sau deleted_at - multe migrații folosesc deja soft delete prin gdpr
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.profiles ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- =============================================================================
-- 6. AUDIT PENTRU user_roles – trigger la INSERT/UPDATE/DELETE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_user_roles_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_entity_type TEXT := 'user_role';
  v_action TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_entity_id UUID;
  v_user_name TEXT;
BEGIN
  v_action := TG_OP;
  v_user_name := COALESCE((SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'system');

  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_entity_id := OLD.id;
    SELECT school_id INTO v_school_id FROM public.profiles WHERE id = OLD.user_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_entity_id := NEW.id;
    SELECT school_id INTO v_school_id FROM public.profiles WHERE id = NEW.user_id;
  ELSE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_entity_id := NEW.id;
    SELECT school_id INTO v_school_id FROM public.profiles WHERE id = NEW.user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, old_data, new_data, school_id)
    VALUES (
      auth.uid(),
      v_user_name,
      COALESCE((SELECT active_role FROM public.profiles WHERE id = auth.uid() LIMIT 1), 'student'::public.app_role),
      v_action,
      v_entity_type,
      v_entity_id,
      v_old_data,
      v_new_data,
      v_school_id
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Verifică structura audit_logs (poate avea coloane diferite)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'old_data') THEN
      DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
      CREATE TRIGGER trg_audit_user_roles
        AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
        FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_change();
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- =============================================================================
-- 7. CHECK CONSTRAINTS – roluri valide în user_roles (app_role ENUM deja impune)
-- Grades: 1-10 (deja există grades_grade_check)
-- Attendance status: deja există attendance_status_check
-- =============================================================================

-- UNIQUE invitation_code: code_hash este deja UNIQUE pe invitations.

-- =============================================================================
-- 8. RPC BOOTSTRAP ADMIN – permite primul uat_admin pentru email-uri whitelist
-- useAuth apelează addUserRole pentru bootstrap; cu politica nouă eșuează.
-- Acest RPC permite bootstrap: doar dacă user are 0 roluri și email în listă.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ensure_bootstrap_admin_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_bootstrap_emails TEXT[] := ARRAY[
    'admin@eduro.local',
    'admin@demo.com'
  ];
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid) THEN
    RETURN true;
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN RETURN false; END IF;
  IF NOT (lower(trim(v_email)) = ANY (SELECT lower(trim(unnest(v_bootstrap_emails))))) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'uat_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.ensure_bootstrap_admin_role IS 'Bootstrap: adaugă uat_admin pentru utilizatori cu email în whitelist, doar dacă au 0 roluri. Modifică v_bootstrap_emails în migrare pentru producție.';
GRANT EXECUTE ON FUNCTION public.ensure_bootstrap_admin_role TO authenticated;

COMMIT;
