-- Backwards compatibility for older UI builds and safer defaults.
-- Some UI builds query `public.messages` for inbox/notifications.

BEGIN;

-- Ensure the table exists.
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own inbox rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_select_own'
  ) THEN
    CREATE POLICY messages_select_own
      ON public.messages
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END$$;

-- Users can mark their own rows as read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_update_own'
  ) THEN
    CREATE POLICY messages_update_own
      ON public.messages
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- Inserts: allow only for the owning user (safe default for dev)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_insert_own'
  ) THEN
    CREATE POLICY messages_insert_own
      ON public.messages
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_messages_user_created
  ON public.messages (user_id, created_at DESC);

COMMIT;
