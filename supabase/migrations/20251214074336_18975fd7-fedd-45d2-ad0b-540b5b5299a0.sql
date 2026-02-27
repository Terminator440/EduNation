
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
CREATE TABLE IF NOT EXISTS public.parent_student_relations (
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
CREATE TABLE IF NOT EXISTS public.student_activations (
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
CREATE TABLE IF NOT EXISTS public.audit_logs (
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
