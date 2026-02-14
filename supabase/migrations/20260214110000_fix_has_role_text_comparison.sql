-- Fix la nivel de schemă: coloana public.user_roles.role trebuie să fie public.app_role (nu text).
-- Presupune că tipul public.app_role există deja (bootstrap). Double cast evită "operator does not exist: app_role = text".
-- Rulează înainte de orice (re)creare a funcției has_role. Idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
  END IF;
END $$;
