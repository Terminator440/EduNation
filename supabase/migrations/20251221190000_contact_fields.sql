-- Add optional contact fields so students/parents can be added by email OR phone.
--
-- NOTE: The current app authentication flow is email + password.
-- These fields are primarily for onboarding/invitations and record-keeping.

-- 1) Students: store contact info even before the student account is activated.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS students_contact_email_unique
  ON public.students (lower(contact_email))
  WHERE contact_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS students_contact_phone_unique
  ON public.students (contact_phone)
  WHERE contact_phone IS NOT NULL;

-- 2) Profiles: optional phone field for users that later activate accounts.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;
