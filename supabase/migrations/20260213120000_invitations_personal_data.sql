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
    IF p_role NOT IN ('student'::public.invitation_role, 'parent'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Homeroom teachers can only invite student / parent'::text;
      RETURN;
    END IF;
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
