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
  SET user_id = (select auth.uid()),
      is_active = true
  WHERE id = act.student_id
    AND (user_id IS NULL OR user_id = (select auth.uid()));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_already_linked';
  END IF;

  UPDATE public.student_activations
  SET is_used = true,
      used_by = (select auth.uid()),
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
  VALUES ((select auth.uid()), act.student_id, _is_primary)
  RETURNING id INTO rel_id;

  UPDATE public.student_activations
  SET is_used = true,
      used_by = (select auth.uid()),
      used_at = now()
  WHERE id = act.id;

  RETURN rel_id;
END;
$$;
