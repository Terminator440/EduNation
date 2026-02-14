
-- Safe app_role + user_roles fix migration

DO $$
DECLARE
  col_type text;
BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
  ) THEN

    CREATE TABLE public.user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role public.app_role NOT NULL,
      UNIQUE (user_id, role)
    );

  ELSE

    SELECT udt_name
    INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
      AND column_name = 'role';

    IF col_type IS NOT NULL AND col_type <> 'app_role' THEN
      EXECUTE '
        ALTER TABLE public.user_roles
        ALTER COLUMN role TYPE public.app_role
        USING role::text::public.app_role
      ';
    END IF;

  END IF;

END $$;
