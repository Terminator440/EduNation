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
