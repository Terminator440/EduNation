-- Ensure user_roles.role is app_role enum (idempotent - only converts if currently text)
DO $$
BEGIN
  -- Only alter if column exists and is NOT already app_role
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role'
      AND udt_name != 'app_role'
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