-- Migration: Create final_grades table and close_semester_grading RPC
-- Stores final calculated grades per student, subject, semester
-- Once saved, grades from that semester cannot be modified

BEGIN;

-- 1) Create final_grades table
CREATE TABLE IF NOT EXISTS public.final_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  final_grade INTEGER NOT NULL CHECK (final_grade >= 1 AND final_grade <= 10),
  calculated_average NUMERIC(4,2) NOT NULL, -- Store the exact average before rounding
  grade_count INTEGER NOT NULL DEFAULT 0, -- Number of grades used in calculation
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year, semester)
);

COMMENT ON TABLE public.final_grades IS 'Stores final calculated grades per student, subject, and semester. Once a final grade is saved, the semester is locked and grades cannot be modified.';
COMMENT ON COLUMN public.final_grades.final_grade IS 'Rounded final grade (1-10) calculated from semester average.';
COMMENT ON COLUMN public.final_grades.calculated_average IS 'Exact average before rounding (for reference).';
COMMENT ON COLUMN public.final_grades.grade_count IS 'Number of grades used in the calculation.';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_final_grades_student ON public.final_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_subject ON public.final_grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_school_year_semester ON public.final_grades(school_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_final_grades_student_subject_year_semester ON public.final_grades(student_id, subject_id, academic_year, semester);

-- Enable RLS
ALTER TABLE public.final_grades ENABLE ROW LEVEL SECURITY;

-- RLS: Students can view their own final grades
CREATE POLICY "Students can view own final grades" ON public.final_grades
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = final_grades.student_id
        AND s.user_id = (select auth.uid())
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

-- RLS: Parents can view their children's final grades
CREATE POLICY "Parents can view children final grades" ON public.final_grades
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = final_grades.student_id
        AND psr.parent_user_id = (select auth.uid())
        AND s.school_id = public.get_user_school_id()
    )
  );

-- RLS: Teachers can view final grades for their students
CREATE POLICY "Teachers can view final grades for assigned classes" ON public.final_grades
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = final_grades.subject_id
        AND s.id = final_grades.student_id
        AND cs.teacher_id = (select auth.uid())
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = final_grades.subject_id
        AND s.id = final_grades.student_id
        AND sub.teacher_id = (select auth.uid())
        AND sub.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- RLS: Staff can view all final grades from their school
CREATE POLICY "Staff can view final grades from school" ON public.final_grades
  FOR SELECT
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role)
      )
    )
    OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- RLS: Only directors/secretariat can insert final grades (via RPC)
CREATE POLICY "Staff can insert final grades" ON public.final_grades
  FOR INSERT
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role)
      )
    )
    OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_final_grades_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_final_grades_updated_at
  BEFORE UPDATE ON public.final_grades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_final_grades_updated_at();

-- 2) Helper function to check if a semester has final grades (is closed)
CREATE OR REPLACE FUNCTION public.is_semester_closed_with_final_grades(
  p_school_id UUID,
  p_academic_year INTEGER,
  p_semester INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.final_grades
  WHERE school_id = p_school_id
    AND academic_year = p_academic_year
    AND semester = p_semester
  LIMIT 1;
  
  RETURN v_count > 0;
END;
$$;

-- 3) Update is_semester_locked_for_grade to also check final_grades
CREATE OR REPLACE FUNCTION public.is_semester_locked_for_grade(p_grade_date DATE, p_student_id UUID)
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
  v_semester_locked BOOLEAN;
  v_has_final_grades BOOLEAN;
BEGIN
  -- Get student's school_id
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id
  LIMIT 1;
  
  IF v_school_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Determine academic year and semester from date
  v_semester := public.get_semester_from_date(p_grade_date);
  
  IF EXTRACT(MONTH FROM p_grade_date) IN (9, 10, 11, 12) THEN
    v_academic_year := EXTRACT(YEAR FROM p_grade_date);
  ELSE
    v_academic_year := EXTRACT(YEAR FROM p_grade_date) - 1;
  END IF;
  
  -- Check if semester is locked in semesters table
  SELECT COALESCE(is_locked, false) INTO v_semester_locked
  FROM public.semesters
  WHERE school_id = v_school_id
    AND academic_year = v_academic_year
    AND semester = v_semester
  LIMIT 1;
  
  -- Check if final grades exist for this semester (semester is closed)
  v_has_final_grades := public.is_semester_closed_with_final_grades(v_school_id, v_academic_year, v_semester);
  
  -- Semester is locked if either condition is true
  RETURN v_semester_locked OR v_has_final_grades;
END;
$$;

-- 4) RPC function: close_semester_grading
-- Calculates final grades for all students in a semester and locks it
CREATE OR REPLACE FUNCTION public.close_semester_grading(
  p_school_id UUID,
  p_academic_year INTEGER,
  p_semester INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  students_processed INTEGER,
  final_grades_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_students_processed INTEGER := 0;
  v_final_grades_created INTEGER := 0;
  v_student_record RECORD;
  v_subject_record RECORD;
  v_average NUMERIC(4,2);
  v_grade_count INTEGER;
  v_final_grade INTEGER;
BEGIN
  -- Get current user
  v_user_id := (select auth.uid());
  
  -- Verify user has permission (director or secretariat from the school)
  IF NOT (
    (
      p_school_id = public.get_user_school_id() AND
      (
        public.has_role(v_user_id, 'director'::app_role) OR
        public.has_role(v_user_id, 'secretariat'::app_role)
      )
    )
    OR
    public.has_role(v_user_id, 'uat_admin'::app_role) OR
    public.has_role(v_user_id, 'developer'::app_role)
  ) THEN
    RETURN QUERY SELECT false, 'Nu aveți permisiunea de a închide semestrul.'::TEXT, 0, 0;
    RETURN;
  END IF;
  
  -- Check if semester already has final grades
  IF public.is_semester_closed_with_final_grades(p_school_id, p_academic_year, p_semester) THEN
    RETURN QUERY SELECT false, 'Semestrul este deja închis.'::TEXT, 0, 0;
    RETURN;
  END IF;
  
  -- Calculate final grades for each student and subject
  FOR v_student_record IN
    SELECT DISTINCT s.id AS student_id, s.school_id
    FROM public.students s
    WHERE s.school_id = p_school_id
  LOOP
    v_students_processed := v_students_processed + 1;
    
    -- For each subject the student has grades in this semester
    FOR v_subject_record IN
      SELECT DISTINCT sub.id AS subject_id, sub.name AS subject_name
      FROM public.subjects sub
      INNER JOIN public.grades g ON g.subject_id = sub.id
      WHERE g.student_id = v_student_record.student_id
        AND g.deleted_at IS NULL
        AND public.get_semester_from_date(g.date) = p_semester
        AND (
          CASE 
            WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
            ELSE EXTRACT(YEAR FROM g.date) - 1
          END
        ) = p_academic_year
    LOOP
      -- Calculate average for this student-subject-semester combination
      SELECT 
        ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2),
        COUNT(*)::INTEGER
      INTO v_average, v_grade_count
      FROM public.grades g
      WHERE g.student_id = v_student_record.student_id
        AND g.subject_id = v_subject_record.subject_id
        AND g.deleted_at IS NULL
        AND public.get_semester_from_date(g.date) = p_semester
        AND (
          CASE 
            WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
            ELSE EXTRACT(YEAR FROM g.date) - 1
          END
        ) = p_academic_year;
      
      -- Only create final grade if there are grades
      IF v_grade_count > 0 AND v_average IS NOT NULL THEN
        -- Round to nearest integer (final grade)
        v_final_grade := ROUND(v_average)::INTEGER;
        
        -- Ensure final grade is between 1 and 10
        IF v_final_grade < 1 THEN
          v_final_grade := 1;
        ELSIF v_final_grade > 10 THEN
          v_final_grade := 10;
        END IF;
        
        -- Insert final grade (ON CONFLICT DO NOTHING to avoid duplicates)
        INSERT INTO public.final_grades (
          student_id,
          subject_id,
          school_id,
          academic_year,
          semester,
          final_grade,
          calculated_average,
          grade_count,
          calculated_by
        )
        VALUES (
          v_student_record.student_id,
          v_subject_record.subject_id,
          p_school_id,
          p_academic_year,
          p_semester,
          v_final_grade,
          v_average,
          v_grade_count,
          v_user_id
        )
        ON CONFLICT (student_id, subject_id, academic_year, semester) DO NOTHING;
        
        IF FOUND THEN
          v_final_grades_created := v_final_grades_created + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Lock the semester in semesters table (create or update)
  INSERT INTO public.semesters (school_id, academic_year, semester, is_locked, locked_at, locked_by)
  VALUES (p_school_id, p_academic_year, p_semester, true, now(), v_user_id)
  ON CONFLICT (school_id, academic_year, semester)
  DO UPDATE SET
    is_locked = true,
    locked_at = now(),
    locked_by = v_user_id,
    updated_at = now();
  
  -- Log audit
  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    school_id
  )
  VALUES (
    v_user_id,
    'close_semester',
    'semester',
    (SELECT id FROM public.semesters WHERE school_id = p_school_id AND academic_year = p_academic_year AND semester = p_semester LIMIT 1),
    jsonb_build_object(
      'school_id', p_school_id,
      'academic_year', p_academic_year,
      'semester', p_semester,
      'students_processed', v_students_processed,
      'final_grades_created', v_final_grades_created
    ),
    p_school_id
  );
  
  RETURN QUERY SELECT 
    true,
    format('Semestrul a fost închis cu succes. %s elevi procesați, %s note finale create.', v_students_processed, v_final_grades_created)::TEXT,
    v_students_processed,
    v_final_grades_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_semester_grading TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_semester_closed_with_final_grades TO authenticated;

COMMENT ON FUNCTION public.close_semester_grading IS 'Calculates and saves final grades for all students in a semester. Once saved, the semester is locked and grades cannot be modified.';
COMMENT ON FUNCTION public.is_semester_closed_with_final_grades IS 'Checks if a semester has final grades (is closed).';

COMMIT;
