-- =============================================================================
-- Director poate fi și profesor: permisiuni pe baza teacher_assignments
-- - Director: vizualizare globală (school_id), editare note DOAR dacă are
--   teacher_assignments sau dacă are can_override_grades (explicit Admin note).
-- - Fără roluri mutual exclusive: același user poate fi director ȘI profesor.
-- =============================================================================

BEGIN;

-- Coloană pentru drept explicit de a edita orice notă în școală (ex: corecții)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_override_grades BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_override_grades IS 'Dacă true, director/secretariat poate edita orice notă din școală (corecții). Implicit false: editare doar prin teacher_assignments.';

-- Funcție helper: user are drept de editare notă fie prin teacher_assignments, fie prin can_override_grades
CREATE OR REPLACE FUNCTION public.user_can_edit_grade(
  p_user_id UUID,
  p_student_id UUID,
  p_subject_id UUID,
  p_school_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Teacher assignments: profesor titular (sau director care predă)
  IF EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.students s ON s.class_id = ta.class_id
    WHERE ta.teacher_id = p_user_id
      AND ta.subject_id = p_subject_id
      AND s.id = p_student_id
      AND ta.school_id = p_school_id
      AND s.school_id = p_school_id
  ) THEN
    RETURN true;
  END IF;

  -- Explicit override: doar director/secretariat cu can_override_grades
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.school_id = p_school_id
      AND p.can_override_grades = true
      AND (p.role::text IN ('director', 'secretariat') OR p.active_role::text IN ('director', 'secretariat'))
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_can_edit_grade IS 'True dacă user poate edita nota: fie are teacher_assignments pentru acel elev/materie, fie e director/secretariat cu can_override_grades.';

-- Rescriem politicile de INSERT/UPDATE pe grades: fără drept automat pentru director/secretariat;
-- doar teacher_assignments sau can_override_grades (și uat_admin/developer ca înainte)
DROP POLICY IF EXISTS "grades_insert_strict" ON public.grades;
DROP POLICY IF EXISTS "grades_update_strict" ON public.grades;

CREATE POLICY "grades_insert_strict" ON public.grades
  FOR INSERT
  WITH CHECK (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

CREATE POLICY "grades_update_strict" ON public.grades
  FOR UPDATE
  USING (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  )
  WITH CHECK (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      public.user_can_edit_grade(auth.uid(), student_id, subject_id, school_id)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

GRANT EXECUTE ON FUNCTION public.user_can_edit_grade TO authenticated;

COMMIT;
