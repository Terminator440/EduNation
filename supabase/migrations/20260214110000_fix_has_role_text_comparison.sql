-- Fix la nivel de schemă: coloana public.user_roles.role trebuie să fie public.app_role (nu text).
-- Conversie doar dacă coloana nu e deja app_role (evită "operator does not exist: app_role = text"). Idempotent.
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
