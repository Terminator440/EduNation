-- School years: add school_id and is_active (one active per school). schools.type for onboarding.
-- Extends existing school_years if present; otherwise ensures table exists.

-- 1) Add type to schools
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS type text;

COMMENT ON COLUMN public.schools.type IS 'School type: e.g. primary, secondary, high_school.';

-- 2) Extend school_years: add school_id and is_active (one active per school)
ALTER TABLE public.school_years
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

ALTER TABLE public.school_years
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_school_years_school_id ON public.school_years(school_id) WHERE school_id IS NOT NULL;

-- Only one active year per school (partial unique index)
DROP INDEX IF EXISTS public.idx_school_years_one_active_per_school;
CREATE UNIQUE INDEX idx_school_years_one_active_per_school
  ON public.school_years(school_id) WHERE (is_active = true AND school_id IS NOT NULL);

-- Ensure label exists (existing table uses label; we use it for name e.g. 2025-2026)
-- No change if column exists

-- 3) RPC: set active year (deactivate others, activate this one)
CREATE OR REPLACE FUNCTION public.school_years_activate(p_school_year_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.school_years WHERE id = p_school_year_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'School year not found';
  END IF;
  IF NOT (public.get_user_school_id() = v_school_id OR public.has_role(auth.uid(), 'uat_admin'::app_role) OR public.has_role(auth.uid(), 'developer'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed to activate this school year';
  END IF;
  UPDATE public.school_years SET is_active = false WHERE school_id = v_school_id;
  UPDATE public.school_years SET is_active = true WHERE id = p_school_year_id;
  RETURN true;
END;
$$;

-- 4) RPC: archive year (set is_active = false; optional: mark as archived in a separate column if we add it later)
CREATE OR REPLACE FUNCTION public.school_years_archive(p_school_year_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM public.school_years WHERE id = p_school_year_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'School year not found'; END IF;
  IF NOT (public.get_user_school_id() = v_school_id OR public.has_role(auth.uid(), 'uat_admin'::app_role) OR public.has_role(auth.uid(), 'developer'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.school_years SET is_active = false WHERE id = p_school_year_id;
  RETURN true;
END;
$$;

-- 5) RPC: promote students (move students to next grade: update class_id to next year's class by name pattern, e.g. 10A -> 11A)
-- Simplified: we only create a placeholder; actual logic depends on class naming. Here we just return success and log.
CREATE OR REPLACE FUNCTION public.school_years_promote_students(p_school_year_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_year_name text;
  v_promoted int := 0;
  v_student record;
  v_next_class_id uuid;
BEGIN
  SELECT school_id, name INTO v_school_id, v_year_name FROM public.school_years WHERE id = p_school_year_id;
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School year not found');
  END IF;
  IF NOT (public.get_user_school_id() = v_school_id OR public.has_role(auth.uid(), 'uat_admin'::app_role) OR public.has_role(auth.uid(), 'developer'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed');
  END IF;
  -- Placeholder: actual promotion would map classes (e.g. 10A -> 11A) and update students.class_id
  -- For now return success with count 0; frontend can implement custom logic or we extend later
  RETURN jsonb_build_object('success', true, 'promoted_count', v_promoted, 'message', 'Promotion run. Implement class mapping per school.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_years_activate TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_years_archive TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_years_promote_students TO authenticated;

COMMENT ON COLUMN public.school_years.school_id IS 'School scope; NULL for legacy global years.';
COMMENT ON COLUMN public.school_years.is_active IS 'Only one active per school.';
