-- Add intended_for column to invitations table for storing invitee name
ALTER TABLE public.invitations 
ADD COLUMN intended_for text;

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