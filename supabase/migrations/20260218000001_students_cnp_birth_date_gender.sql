-- Add CNP, birth_date and gender to students for registration forms (optional).
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS cnp TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT;

COMMENT ON COLUMN public.students.cnp IS 'Romanian CNP (Cod Numeric Personal), 13 digits';
COMMENT ON COLUMN public.students.birth_date IS 'Birth date; can be derived from CNP';
COMMENT ON COLUMN public.students.gender IS 'M or F; can be derived from CNP';
