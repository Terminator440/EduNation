-- Migration: Create semesters table with is_locked column
-- Modify RLS policies on grades INSERT/UPDATE to check if semester is locked
-- Database-level enforcement: if is_locked = true, reject any modification regardless of UI

BEGIN;

-- 1) Create semesters table
CREATE TABLE IF NOT EXISTS public.semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, academic_year, semester)
);

COMMENT ON TABLE public.semesters IS 'Tracks semester lock status per school and academic year. When is_locked = true, no grades can be inserted or updated for that semester.';
COMMENT ON COLUMN public.semesters.is_locked IS 'If true, prevents all INSERT/UPDATE operations on grades for this semester.';
COMMENT ON COLUMN public.semesters.academic_year IS 'Academic year (e.g., 2024 for 2024-2025 school year).';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_semesters_school_year_semester ON public.semesters(school_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_semesters_is_locked ON public.semesters(is_locked) WHERE is_locked = true;

-- Enable RLS
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view semesters from their school
CREATE POLICY "Users can view semesters from their school" ON public.semesters
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- RLS: Only directors/secretariat can manage semesters
CREATE POLICY "Staff can manage semesters" ON public.semesters
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_semesters_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_semesters_updated_at ON public.semesters;
CREATE TRIGGER trg_update_semesters_updated_at
  BEFORE UPDATE ON public.semesters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_semesters_updated_at();

-- 2) Helper function to get academic year from a date
-- Returns the academic year (e.g., 2024 for 2024-2025)
CREATE OR REPLACE FUNCTION public.get_academic_year_from_date(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  month_val INTEGER;
  year_val INTEGER;
BEGIN
  month_val := EXTRACT(MONTH FROM p_date);
  year_val := EXTRACT(YEAR FROM p_date);
  
  -- For September-December, academic year is the same as calendar year
  -- For January-June, academic year is previous calendar year
  IF month_val IN (9, 10, 11, 12) THEN
    RETURN year_val;
  ELSE
    RETURN year_val - 1;
  END IF;
END;
$$;

-- 3) Helper function to check if a semester is locked for a grade date
CREATE OR REPLACE FUNCTION public.is_semester_locked_for_grade(
  p_grade_date DATE,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_academic_year INTEGER;
  v_semester INTEGER;
  v_is_locked BOOLEAN;
BEGIN
  -- Get student's school_id
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id;
  
  IF v_school_id IS NULL THEN
    -- If we can't determine school, allow (will be caught by other RLS policies)
    RETURN false;
  END IF;
  
  -- Calculate academic year and semester from date
  v_academic_year := public.get_academic_year_from_date(p_grade_date);
  v_semester := public.get_semester_from_date(p_grade_date);
  
  -- Check if semester is locked
  SELECT is_locked INTO v_is_locked
  FROM public.semesters
  WHERE school_id = v_school_id
    AND academic_year = v_academic_year
    AND semester = v_semester;
  
  -- If semester doesn't exist, it's not locked (default behavior)
  IF v_is_locked IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN v_is_locked;
END;
$$;

-- 4) Drop existing INSERT and UPDATE policies on grades (from previous migrations)
DROP POLICY IF EXISTS "Teachers can insert grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (teacher-subject access)" ON public.grades;

-- 5) Recreate INSERT policy with semester lock check
CREATE POLICY "Teachers can insert grades for assigned classes (semester check)" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Then check: teacher must be assigned to teach this subject in the student's class
    (
      (select auth.uid()) IN (
        SELECT cs.teacher_id
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = (select auth.uid())
          AND cs.school_id = public.get_user_school_id()
      )
      OR
      -- Fallback: Teacher assigned directly to subject (for backward compatibility)
      (
        (select auth.uid()) IN (
          SELECT teacher_id 
          FROM public.subjects 
          WHERE id = subject_id 
            AND teacher_id = (select auth.uid())
            AND school_id = public.get_user_school_id()
        )
        AND student_id IN (
          SELECT s.id
          FROM public.students s
          JOIN public.subjects sub ON sub.class_id = s.class_id
          WHERE sub.id = subject_id
            AND s.school_id = public.get_user_school_id()
        )
      )
      OR
      -- Staff (director/secretariat) can insert grades even if semester is locked (for corrections)
      (
        (
          public.has_role((select auth.uid()), 'director'::app_role) OR
          public.has_role((select auth.uid()), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      -- UAT Admin and Developer can insert
      public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
      public.has_role((select auth.uid()), 'developer'::app_role)
    )
  );

-- 6) Recreate UPDATE policy with semester lock check
CREATE POLICY "Teachers can update grades for assigned classes (semester check)" ON public.grades
  FOR UPDATE
  USING (
    -- First check: semester must not be locked (check OLD date for existing grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Then check: teacher must be assigned to teach this subject in the student's class
    (
      (select auth.uid()) IN (
        SELECT cs.teacher_id
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = (select auth.uid())
          AND cs.school_id = public.get_user_school_id()
      )
      OR
      -- Fallback: Teacher assigned directly to subject (for backward compatibility)
      (
        (select auth.uid()) IN (
          SELECT teacher_id 
          FROM public.subjects 
          WHERE id = subject_id 
            AND teacher_id = (select auth.uid())
            AND school_id = public.get_user_school_id()
        )
        AND student_id IN (
          SELECT s.id
          FROM public.students s
          JOIN public.subjects sub ON sub.class_id = s.class_id
          WHERE sub.id = subject_id
            AND s.school_id = public.get_user_school_id()
        )
      )
      OR
      -- Staff (director/secretariat) can update grades even if semester is locked (for corrections)
      (
        (
          public.has_role((select auth.uid()), 'director'::app_role) OR
          public.has_role((select auth.uid()), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      -- UAT Admin and Developer can update
      public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
      public.has_role((select auth.uid()), 'developer'::app_role)
    )
  )
  WITH CHECK (
    -- First check: semester must not be locked (check NEW date for updated grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Then check: teacher must be assigned to teach this subject in the student's class
    (
      (select auth.uid()) IN (
        SELECT cs.teacher_id
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = (select auth.uid())
          AND cs.school_id = public.get_user_school_id()
      )
      OR
      -- Fallback: Teacher assigned directly to subject (for backward compatibility)
      (
        (select auth.uid()) IN (
          SELECT teacher_id 
          FROM public.subjects 
          WHERE id = subject_id 
            AND teacher_id = (select auth.uid())
            AND school_id = public.get_user_school_id()
        )
        AND student_id IN (
          SELECT s.id
          FROM public.students s
          JOIN public.subjects sub ON sub.class_id = s.class_id
          WHERE sub.id = subject_id
            AND s.school_id = public.get_user_school_id()
        )
      )
      OR
      -- Staff (director/secretariat) can update grades even if semester is locked (for corrections)
      (
        (
          public.has_role((select auth.uid()), 'director'::app_role) OR
          public.has_role((select auth.uid()), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      -- UAT Admin and Developer can update
      public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
      public.has_role((select auth.uid()), 'developer'::app_role)
    )
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_academic_year_from_date TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_semester_locked_for_grade TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.get_academic_year_from_date IS 'Helper function to determine academic year from a date. Returns year for Sep-Dec, year-1 for Jan-Jun.';
COMMENT ON FUNCTION public.is_semester_locked_for_grade IS 'Checks if the semester for a given grade date and student is locked. Returns true if semester is_locked = true, preventing INSERT/UPDATE.';

COMMIT;
