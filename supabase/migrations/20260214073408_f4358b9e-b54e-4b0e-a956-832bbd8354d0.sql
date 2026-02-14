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