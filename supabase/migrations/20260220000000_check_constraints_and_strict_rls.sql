-- Migration: Add CHECK constraints and implement strict RLS policies
-- 1. Ensure grades are integers between 1-10
-- 2. Add CHECK constraint for attendance is_excused
-- 3. Create class_subjects junction table for teacher-class-subject assignments
-- 4. Implement strict RLS: students can only see their own grades
-- 5. Implement strict RLS: teachers can only see grades for classes where they teach subjects

BEGIN;

-- ============================================================================
-- PART 1: CHECK CONSTRAINTS
-- ============================================================================

-- 1.1) Ensure grades are integers between 1-10
-- First, drop views that depend on grades.grade (must drop before ALTER COLUMN)
DROP VIEW IF EXISTS public.view_student_general_average CASCADE;
DROP VIEW IF EXISTS public.view_student_subject_average CASCADE;

-- Check if grade column is DECIMAL/NUMERIC and needs conversion
DO $$
BEGIN
  -- Check if grade column exists and is not integer
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'grades' 
    AND column_name = 'grade'
    AND data_type NOT IN ('integer', 'smallint', 'bigint')
  ) THEN
    -- Convert existing grades to integers (round to nearest integer)
    UPDATE public.grades 
    SET grade = ROUND(grade::numeric)::integer
    WHERE grade IS NOT NULL;
    
    -- Alter column type to integer
    ALTER TABLE public.grades 
    ALTER COLUMN grade TYPE INTEGER USING ROUND(grade::numeric)::integer;
  END IF;
END $$;

-- Recreate views that depend on grades
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

CREATE OR REPLACE VIEW public.view_student_general_average AS
SELECT
  student_id,
  AVG(average)::NUMERIC(4,2) AS general_average,
  COUNT(*)::INTEGER AS subject_count
FROM public.view_student_subject_average
GROUP BY student_id;

-- Add or replace CHECK constraint for grades (1-10)
ALTER TABLE public.grades 
DROP CONSTRAINT IF EXISTS grades_grade_check;

ALTER TABLE public.grades 
ADD CONSTRAINT grades_grade_check 
CHECK (grade >= 1 AND grade <= 10);

-- 1.2) Ensure is_excused is properly constrained (boolean already has implicit constraint)
-- Add explicit CHECK if needed for data integrity
ALTER TABLE public.attendance 
DROP CONSTRAINT IF EXISTS attendance_is_excused_check;

-- Boolean columns don't need CHECK constraints, but we ensure it's NOT NULL
ALTER TABLE public.attendance 
ALTER COLUMN is_excused SET NOT NULL;

-- ============================================================================
-- PART 2: CLASS_SUBJECTS JUNCTION TABLE
-- ============================================================================

-- 2.1) Create class_subjects junction table
-- This allows a teacher to be assigned to teach a subject in a specific class
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (class_id, subject_id, teacher_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_class_subjects_class_id ON public.class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject_id ON public.class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher_id ON public.class_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school_id ON public.class_subjects(school_id);

-- Enable RLS
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

-- 2.2) Populate class_subjects from existing subjects table
-- Migrate existing teacher-subject-class relationships
INSERT INTO public.class_subjects (class_id, subject_id, teacher_id, school_id)
SELECT DISTINCT 
  s.class_id,
  s.id AS subject_id,
  s.teacher_id,
  s.school_id
FROM public.subjects s
WHERE s.class_id IS NOT NULL 
  AND s.teacher_id IS NOT NULL
  AND s.school_id IS NOT NULL
ON CONFLICT (class_id, subject_id, teacher_id) DO NOTHING;

-- 2.3) Add trigger to automatically set school_id on INSERT
CREATE OR REPLACE FUNCTION public.set_class_subject_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    -- Try to get school_id from class
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
    
    -- If still NULL, try from subject
    IF NEW.school_id IS NULL THEN
      SELECT school_id INTO NEW.school_id
      FROM public.subjects
      WHERE id = NEW.subject_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_class_subject_school_id ON public.class_subjects;
CREATE TRIGGER trg_set_class_subject_school_id
  BEFORE INSERT OR UPDATE ON public.class_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_class_subject_school_id();

-- ============================================================================
-- PART 3: STRICT RLS POLICIES FOR GRADES
-- ============================================================================

-- 3.1) Drop existing grades policies to recreate with strict rules
DROP POLICY IF EXISTS "Users can view grades from their school" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Students teachers and parents can view grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Staff can manage all grades" ON public.grades;
DROP POLICY IF EXISTS "Developers can view all grades" ON public.grades;

-- 3.2) SELECT: Students can only see their own grades
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    -- Student can view their own grades ((select auth.uid()) matches students.user_id)
    (select auth.uid()) IN (
      SELECT user_id 
      FROM public.students 
      WHERE id = student_id 
        AND user_id IS NOT NULL
        AND school_id = public.get_user_school_id()
    )
    OR
    -- Staff (director/secretariat) can view all grades from their school
    (
      public.has_role((select auth.uid()), 'director'::app_role) OR
      public.has_role((select auth.uid()), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 3.3) SELECT: Teachers can only see grades for classes where they teach subjects
CREATE POLICY "Teachers can view grades for assigned classes" ON public.grades
  FOR SELECT
  USING (
    -- Teacher can view grades if they teach the subject in the student's class
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
    -- Staff (director/secretariat) can view all grades from their school
    (
      public.has_role((select auth.uid()), 'director'::app_role) OR
      public.has_role((select auth.uid()), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 3.4) SELECT: Parents can view their children's grades
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    -- Parent can view their child's grades
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = student_id
        AND psr.parent_user_id = (select auth.uid())
    )
    AND school_id = public.get_user_school_id()
  );

-- 3.5) INSERT: Only teachers assigned to the subject in that class can insert grades
CREATE POLICY "Teachers can insert grades for assigned classes" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- Teacher must be assigned to teach this subject in the student's class
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
    -- Staff (director/secretariat) can insert grades
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
  );

-- 3.6) UPDATE: Only teachers assigned to the subject in that class can update grades
CREATE POLICY "Teachers can update grades for assigned classes" ON public.grades
  FOR UPDATE
  USING (
    -- Teacher must be assigned to teach this subject in the student's class
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
    -- Staff (director/secretariat) can update grades
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
  WITH CHECK (
    -- Same conditions for WITH CHECK
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
    (
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 3.7) DELETE: Only teachers assigned to the subject in that class can delete grades
CREATE POLICY "Teachers can delete grades for assigned classes" ON public.grades
  FOR DELETE
  USING (
    -- Teacher must be assigned to teach this subject in the student's class
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
    -- Staff (director/secretariat) can delete grades
    (
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can delete
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- ============================================================================
-- PART 4: STRICT RLS POLICIES FOR ATTENDANCE (similar to grades)
-- ============================================================================

-- 4.1) Drop existing attendance policies to recreate with strict rules
DROP POLICY IF EXISTS "Users can view attendance from their school" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can insert attendance (scoped)" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can update attendance (scoped)" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can delete attendance (scoped)" ON public.attendance;
DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can view attendance for assigned classes" ON public.attendance;
DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can manage attendance for assigned classes" ON public.attendance;

-- 4.2) SELECT: Students can only see their own attendance
CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Student can view their own attendance
    (select auth.uid()) IN (
      SELECT user_id 
      FROM public.students 
      WHERE id = student_id 
        AND user_id IS NOT NULL
        AND school_id = public.get_user_school_id()
    )
    OR
    -- Staff (director/secretariat) can view all attendance from their school
    (
      public.has_role((select auth.uid()), 'director'::app_role) OR
      public.has_role((select auth.uid()), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 4.3) SELECT: Teachers can only see attendance for classes where they teach subjects
CREATE POLICY "Teachers can view attendance for assigned classes" ON public.attendance
  FOR SELECT
  USING (
    -- Teacher can view attendance if they teach the subject in the student's class
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
    -- Staff (director/secretariat) can view all attendance from their school
    (
      public.has_role((select auth.uid()), 'director'::app_role) OR
      public.has_role((select auth.uid()), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 4.4) SELECT: Parents can view their children's attendance
CREATE POLICY "Parents can view children attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Parent can view their child's attendance
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = student_id
        AND psr.parent_user_id = (select auth.uid())
    )
    AND school_id = public.get_user_school_id()
  );

-- 4.5) INSERT/UPDATE/DELETE: Only teachers assigned to the subject in that class can modify attendance
CREATE POLICY "Teachers can manage attendance for assigned classes" ON public.attendance
  FOR ALL
  USING (
    -- Teacher must be assigned to teach this subject in the student's class
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
    -- Staff (director/secretariat) can manage attendance
    (
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can manage
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK
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
    (
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- ============================================================================
-- PART 5: RLS POLICIES FOR CLASS_SUBJECTS TABLE
-- ============================================================================

-- 5.1) Users can view class_subjects from their school
CREATE POLICY "Users can view class_subjects from their school" ON public.class_subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 5.2) Staff can manage class_subjects
CREATE POLICY "Staff can manage class_subjects" ON public.class_subjects
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

COMMIT;
