-- Migration: academic_year, academic_year_snapshots, views for averages, recalc function
-- Part 1: Core schema for year management and grade/attendance views
-- Frontend must read from views, not compute with map/reduce

BEGIN;

-- 1) academic_year table
CREATE TABLE IF NOT EXISTS public.academic_year (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  year_closed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, year)
);

ALTER TABLE public.academic_year ENABLE ROW LEVEL SECURITY;

-- Directors/secretariat can manage academic years
CREATE POLICY "Staff can manage academic_year"
  ON public.academic_year FOR ALL
  USING (
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role)
  );

-- 2) Link classes to academic_year (optional - classes.year can map to academic_year.year)
-- Add academic_year_id to classes if we want explicit FK; for now we derive from year + school_id

-- 3) academic_year_snapshots - frozen data when year is closed
CREATE TABLE IF NOT EXISTS public.academic_year_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_year(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  subject_name TEXT,
  average NUMERIC(4,2),
  grades_json JSONB,
  attendance_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (academic_year_id, student_id, subject_id)
);

ALTER TABLE public.academic_year_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view academic_year_snapshots"
  ON public.academic_year_snapshots FOR SELECT
  USING (
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role) OR
    has_role((select auth.uid()), 'homeroom_teacher'::app_role) OR
    has_role((select auth.uid()), 'teacher'::app_role)
  );

CREATE POLICY "Parents can view own children snapshots"
  ON public.academic_year_snapshots FOR SELECT
  USING (
    student_id IN (
      SELECT psr.student_id FROM public.parent_student_relations psr
      WHERE psr.parent_user_id = (select auth.uid())
    )
  );

CREATE POLICY "Students can view own snapshot"
  ON public.academic_year_snapshots FOR SELECT
  USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = (select auth.uid()))
  );

-- 4) view_student_subject_average - computed from grades (excludes deleted)
CREATE OR REPLACE VIEW public.view_student_subject_average AS
SELECT
  g.student_id,
  g.subject_id,
  s.name AS subject_name,
  AVG(g.grade)::NUMERIC(4,2) AS average,
  COUNT(*)::INTEGER AS grade_count
FROM public.grades g
JOIN public.subjects s ON s.id = g.subject_id
WHERE g.deleted_at IS NULL
GROUP BY g.student_id, g.subject_id, s.name;

-- 5) view_student_general_average - computed from view_student_subject_average
CREATE OR REPLACE VIEW public.view_student_general_average AS
SELECT
  student_id,
  AVG(average)::NUMERIC(4,2) AS general_average,
  COUNT(*)::INTEGER AS subject_count
FROM public.view_student_subject_average
GROUP BY student_id;

-- 6) recalc_student_averages(student_id) - validation helper, returns computed averages
CREATE OR REPLACE FUNCTION public.recalc_student_averages(p_student_id UUID)
RETURNS TABLE(subject_id UUID, subject_name TEXT, average NUMERIC, grade_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vs.subject_id, vs.subject_name, vs.average, vs.grade_count
  FROM public.view_student_subject_average vs
  WHERE vs.student_id = p_student_id;
$$;

-- Ensure grades CHECK (1-10) - bootstrap may have it; enforce if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grades'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%grade%1%10%'
  ) THEN
    ALTER TABLE public.grades
      DROP CONSTRAINT IF EXISTS grades_grade_check;
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);
  END IF;
END $$;

COMMIT;
