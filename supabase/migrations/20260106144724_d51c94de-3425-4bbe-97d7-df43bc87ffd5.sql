-- Create schools table
CREATE TABLE IF NOT EXISTS public.schools (
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
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'developer'::app_role)
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
CREATE TABLE IF NOT EXISTS public.invitations (
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
  USING (has_role((select auth.uid()), 'developer'::app_role));

-- Directors can manage invitations for their school (teacher/homeroom_teacher only)
CREATE POLICY "Directors can manage teacher invitations"
  ON public.invitations FOR ALL
  USING (
    has_role((select auth.uid()), 'director'::app_role) AND
    role IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role) AND
    school_id IN (
      SELECT p.school_id FROM public.profiles p WHERE p.id = (select auth.uid())
    )
  );

-- Homeroom teachers can manage student/parent invitations for their class
CREATE POLICY "Homeroom teachers can manage student parent invitations"
  ON public.invitations FOR ALL
  USING (
    has_role((select auth.uid()), 'homeroom_teacher'::app_role) AND
    role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND
    class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = (select auth.uid())
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
  USING (created_by_user_id = (select auth.uid()));

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
  v_created_by := COALESCE(p_created_by, (select auth.uid()));
  
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