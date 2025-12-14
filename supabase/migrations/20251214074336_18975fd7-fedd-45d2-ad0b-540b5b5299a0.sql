
-- Drop dependent policies and functions first, then recreate
DROP POLICY IF EXISTS "Teachers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Teachers can view their classes" ON public.classes;
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);

-- Create new enum type
CREATE TYPE public.app_role_new AS ENUM ('student', 'parent', 'teacher', 'homeroom_teacher', 'secretariat', 'director', 'uat_admin');

-- Update user_roles table to use new enum
ALTER TABLE public.user_roles 
  ALTER COLUMN role TYPE app_role_new 
  USING (
    CASE role::text
      WHEN 'elev' THEN 'student'::app_role_new
      WHEN 'profesor' THEN 'teacher'::app_role_new
      WHEN 'parinte' THEN 'parent'::app_role_new
    END
  );

-- Drop old enum and rename new one
DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;

-- Add active_role column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_role app_role DEFAULT 'student';

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

CREATE POLICY "Parents can view their relations" ON public.parent_student_relations
  FOR SELECT USING (parent_user_id = auth.uid());

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

CREATE POLICY "Staff can manage activations" ON public.student_activations
  FOR ALL USING (
    has_role(auth.uid(), 'secretariat') OR 
    has_role(auth.uid(), 'director') OR 
    has_role(auth.uid(), 'homeroom_teacher')
  );

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

CREATE POLICY "Directors can view all audit logs" ON public.audit_logs
  FOR SELECT USING (has_role(auth.uid(), 'director'));

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
