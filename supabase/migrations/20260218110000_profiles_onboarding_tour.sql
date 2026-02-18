-- Store whether the teacher onboarding tour has been completed (run once per user).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_tour_completed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.onboarding_tour_completed IS 'When true, the teacher onboarding tour will not be shown again.';
