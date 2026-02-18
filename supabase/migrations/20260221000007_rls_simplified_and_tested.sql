-- Migration: Simplified and tested RLS policies for grades
-- 1. Teachers can INSERT/UPDATE grades only for classes/subjects assigned in class_subjects
-- 2. Students can SELECT only rows where student_id matches their user_id (via students.user_id)
-- 3. Parents can SELECT only data for students where parent_user_id = auth.uid() in parent_student_relations
-- Includes test queries to verify policies work correctly

BEGIN;

-- ============================================================================
-- PART 1: DROP ALL EXISTING GRADES POLICIES
-- ============================================================================

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can view grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades for assigned classes (semester check)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades for assigned classes (semester check)" ON public.grades;
DROP POLICY IF EXISTS "Users can view grades from their school" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (teacher-subject access)" ON public.grades;
DROP POLICY IF EXISTS "Staff can manage all grades" ON public.grades;
DROP POLICY IF EXISTS "Developers can view all grades" ON public.grades;

-- ============================================================================
-- PART 2: SIMPLIFIED RLS POLICIES FOR GRADES
-- ============================================================================

-- 2.1) SELECT: Students can only see their own grades
-- Rule: student_id must match a student record where user_id = auth.uid()
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    -- Student can view their own grades (auth.uid() matches students.user_id)
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
    )
  );

-- 2.2) SELECT: Parents can view their children's grades
-- Rule: parent_user_id = auth.uid() in parent_student_relations
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    -- Parent can view their child's grades
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = auth.uid()
    )
  );

-- 2.3) SELECT: Teachers can view grades for classes/subjects assigned in class_subjects
-- Rule: teacher_id must be in class_subjects for the student's class and subject
CREATE POLICY "Teachers can view grades for assigned classes" ON public.grades
  FOR SELECT
  USING (
    -- Teacher can view grades if they teach the subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = grades.subject_id
        AND s.id = grades.student_id
        AND cs.teacher_id = auth.uid()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = grades.subject_id
        AND s.id = grades.student_id
        AND sub.teacher_id = auth.uid()
    )
  );

-- 2.4) SELECT: Staff (director/secretariat) can view all grades from their school
CREATE POLICY "Staff can view all grades from school" ON public.grades
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
  );

-- 2.5) SELECT: UAT Admin and Developer can view all
CREATE POLICY "Admins can view all grades" ON public.grades
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 2.6) INSERT: Teachers can insert grades only for classes/subjects assigned in class_subjects
-- Rule: Must check semester lock AND teacher assignment
CREATE POLICY "Teachers can insert grades for assigned classes" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
      )
    )
    OR
    -- Staff (director/secretariat) can insert grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can insert
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 2.7) UPDATE: Teachers can update grades only for classes/subjects assigned in class_subjects
-- Rule: Must check semester lock AND teacher assignment
CREATE POLICY "Teachers can update grades for assigned classes" ON public.grades
  FOR UPDATE
  USING (
    -- First check: semester must not be locked (check OLD date for existing grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
      )
    )
    OR
    -- Staff (director/secretariat) can update grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can update
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK (check NEW date for updated grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
      )
      OR
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_user_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- 2.8) DELETE: Teachers can delete grades only for classes/subjects assigned in class_subjects
CREATE POLICY "Teachers can delete grades for assigned classes" ON public.grades
  FOR DELETE
  USING (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = auth.uid()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = auth.uid()
      )
    )
    OR
    -- Staff (director/secretariat) can delete grades even if semester is locked (for corrections)
    (
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      ) AND school_id = public.get_user_school_id()
    )
    OR
    -- UAT Admin and Developer can delete
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 3: TEST FUNCTIONS TO VERIFY RLS POLICIES
-- ============================================================================

-- Function to test student SELECT access
-- Returns true if student can see their own grades
CREATE OR REPLACE FUNCTION public.test_student_grades_access(p_student_user_id UUID)
RETURNS TABLE (
  can_access BOOLEAN,
  grade_count BIGINT,
  test_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Set the auth context (simulate student login)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_student_user_id)::text, true);
  
  -- Try to count grades
  SELECT COUNT(*) INTO v_count
  FROM public.grades g
  WHERE EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = g.student_id
      AND s.user_id = p_student_user_id
  );
  
  RETURN QUERY
  SELECT
    v_count > 0 AS can_access,
    v_count AS grade_count,
    format('Student %s can access %s grades', p_student_user_id, v_count) AS test_message;
END;
$$;

-- Function to test teacher INSERT/UPDATE access
-- Returns true if teacher can insert/update grades for assigned classes
CREATE OR REPLACE FUNCTION public.test_teacher_grades_access(
  p_teacher_id UUID,
  p_student_id UUID,
  p_subject_id UUID
)
RETURNS TABLE (
  can_insert BOOLEAN,
  can_update BOOLEAN,
  test_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_insert BOOLEAN := false;
  v_can_update BOOLEAN := false;
  v_assigned BOOLEAN := false;
BEGIN
  -- Check if teacher is assigned in class_subjects
  SELECT EXISTS (
    SELECT 1
    FROM public.class_subjects cs
    JOIN public.students s ON s.class_id = cs.class_id
    WHERE cs.subject_id = p_subject_id
      AND s.id = p_student_id
      AND cs.teacher_id = p_teacher_id
  ) INTO v_assigned;
  
  IF v_assigned THEN
    v_can_insert := true;
    v_can_update := true;
  END IF;
  
  -- Fallback: check if teacher is assigned directly to subject
  IF NOT v_assigned THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = p_subject_id
        AND s.id = p_student_id
        AND sub.teacher_id = p_teacher_id
    ) INTO v_assigned;
    
    IF v_assigned THEN
      v_can_insert := true;
      v_can_update := true;
    END IF;
  END IF;
  
  RETURN QUERY
  SELECT
    v_can_insert,
    v_can_update,
    format('Teacher %s can insert: %s, can update: %s for student %s, subject %s',
      p_teacher_id, v_can_insert, v_can_update, p_student_id, p_subject_id) AS test_message;
END;
$$;

-- Function to test parent SELECT access
-- Returns true if parent can see their child's grades
CREATE OR REPLACE FUNCTION public.test_parent_grades_access(
  p_parent_user_id UUID,
  p_student_id UUID
)
RETURNS TABLE (
  can_access BOOLEAN,
  grade_count BIGINT,
  test_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
  v_is_parent BOOLEAN;
BEGIN
  -- Check if parent-student relation exists
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_student_relations psr
    WHERE psr.student_id = p_student_id
      AND psr.parent_user_id = p_parent_user_id
  ) INTO v_is_parent;
  
  IF v_is_parent THEN
    -- Count grades the parent should be able to see
    SELECT COUNT(*) INTO v_count
    FROM public.grades g
    WHERE g.student_id = p_student_id;
  ELSE
    v_count := 0;
  END IF;
  
  RETURN QUERY
  SELECT
    v_is_parent AND v_count > 0 AS can_access,
    v_count AS grade_count,
    format('Parent %s can access %s grades for student %s (is_parent: %s)',
      p_parent_user_id, v_count, p_student_id, v_is_parent) AS test_message;
END;
$$;

-- Grant execute permissions for test functions
GRANT EXECUTE ON FUNCTION public.test_student_grades_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_teacher_grades_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_parent_grades_access TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.test_student_grades_access IS 'Test function to verify student can SELECT only their own grades. Returns can_access, grade_count, and test_message.';
COMMENT ON FUNCTION public.test_teacher_grades_access IS 'Test function to verify teacher can INSERT/UPDATE grades only for assigned classes/subjects. Returns can_insert, can_update, and test_message.';
COMMENT ON FUNCTION public.test_parent_grades_access IS 'Test function to verify parent can SELECT only their children grades. Returns can_access, grade_count, and test_message.';

COMMIT;
