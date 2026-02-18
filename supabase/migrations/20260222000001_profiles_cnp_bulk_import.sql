-- Add CNP (Cod Numeric Personal) to profiles for bulk import and identity checks
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cnp TEXT;

COMMENT ON COLUMN public.profiles.cnp IS 'Romanian personal numeric code (13 digits), optional. Used for bulk import validation and identity.';

-- Optional: unique constraint only for non-null CNPs (one CNP per person in system)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cnp_unique ON public.profiles(cnp) WHERE cnp IS NOT NULL;
