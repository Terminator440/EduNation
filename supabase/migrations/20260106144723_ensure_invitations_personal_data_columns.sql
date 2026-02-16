-- Ensure invitations table has personal data columns before any functions use them.
-- This migration runs BEFORE 20260106144724 to ensure columns exist.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

-- Note: This migration assumes invitations table might not exist yet (created in 20260106144724).
-- If table doesn't exist, this does nothing. The CREATE TABLE in 20260106144724 includes these columns.
-- If table exists (from a previous run), this adds missing columns.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invitations') THEN
    ALTER TABLE public.invitations
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
      ADD COLUMN IF NOT EXISTS invited_email TEXT,
      ADD COLUMN IF NOT EXISTS invited_phone TEXT,
      ADD COLUMN IF NOT EXISTS intended_for TEXT;
  END IF;
END $$;
