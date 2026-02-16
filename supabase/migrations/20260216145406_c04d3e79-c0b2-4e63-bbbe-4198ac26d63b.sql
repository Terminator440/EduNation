
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
