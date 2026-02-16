-- Final migration to ensure invitations table has all personal data columns.
-- This runs AFTER all other migrations to guarantee columns exist.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

-- Ensure all personal data columns exist in invitations table
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS invited_student_number INTEGER,
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_phone TEXT,
  ADD COLUMN IF NOT EXISTS intended_for TEXT;
