-- Coloana user_roles.role devine public.app_role (nu text). Tipul public.app_role există din migrări anterioare.
-- Double cast USING role::text::public.app_role evită "operator does not exist: app_role = text". Idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
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
