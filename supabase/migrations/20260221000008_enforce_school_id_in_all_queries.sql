-- Migration: Ensure ALL RLS policies enforce school_id filtering
-- This is critical for multi-tenancy: no user should see data from another school
-- Even if they have a student_id from another school, RLS must block access

BEGIN;

-- ============================================================================
-- PART 1: VERIFY AND UPDATE GRADES RLS POLICIES
-- ============================================================================

-- Ensure all grades policies include school_id check
-- Students policy already checks via students.user_id -> students.school_id (implicit)
-- But we make it explicit for clarity

-- Update Students policy to explicitly check school_id
DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    -- Student can view their own grades ((select auth.uid()) matches students.user_id)
    -- AND student belongs to user's school (via students.school_id)
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = (select auth.uid())
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update Parents policy to explicitly check school_id
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    -- Parent can view their child's grades
    -- AND child belongs to parent's school (via students.school_id)
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = (select auth.uid())
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update Teachers policy to explicitly check school_id
DROP POLICY IF EXISTS "Teachers can view grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can view grades for assigned classes" ON public.grades
  FOR SELECT
  USING (
    -- Teacher can view grades if they teach the subject in the student's class
    -- AND all belong to teacher's school
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = grades.subject_id
        AND s.id = grades.student_id
        AND cs.teacher_id = (select auth.uid())
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = grades.subject_id
        AND s.id = grades.student_id
        AND sub.teacher_id = (select auth.uid())
        AND sub.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update INSERT policy to explicitly check school_id
DROP POLICY IF EXISTS "Teachers can insert grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can insert grades for assigned classes" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: school_id must match
    school_id = public.get_user_school_id()
    AND
    -- Third check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = (select auth.uid())
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
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
          AND sub.teacher_id = (select auth.uid())
          AND sub.school_id = public.get_user_school_id()
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
  );

-- Update UPDATE policy to explicitly check school_id
DROP POLICY IF EXISTS "Teachers can update grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can update grades for assigned classes" ON public.grades
  FOR UPDATE
  USING (
    -- First check: semester must not be locked (check OLD date for existing grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: school_id must match
    school_id = public.get_user_school_id()
    AND
    -- Third check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = (select auth.uid())
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
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
          AND sub.teacher_id = (select auth.uid())
          AND sub.school_id = public.get_user_school_id()
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
  WITH CHECK (
    -- Same conditions for WITH CHECK (check NEW date for updated grade)
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    school_id = public.get_user_school_id()
    AND
    (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.teacher_id = (select auth.uid())
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = subject_id
          AND s.id = student_id
          AND sub.teacher_id = (select auth.uid())
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
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
    )
  );

-- Update DELETE policy to explicitly check school_id
DROP POLICY IF EXISTS "Teachers can delete grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can delete grades for assigned classes" ON public.grades
  FOR DELETE
  USING (
    -- First check: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second check: school_id must match
    school_id = public.get_user_school_id()
    AND
    -- Third check: teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = subject_id
        AND s.id = student_id
        AND cs.teacher_id = (select auth.uid())
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
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
          AND sub.teacher_id = (select auth.uid())
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff (director/secretariat) can delete grades even if semester is locked (for corrections)
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
-- PART 2: VERIFY AND UPDATE ATTENDANCE RLS POLICIES
-- ============================================================================

-- Update Students policy for attendance
DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Student can view their own attendance
    -- AND student belongs to user's school
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = attendance.student_id
        AND s.user_id = (select auth.uid())
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update Parents policy for attendance
DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
CREATE POLICY "Parents can view children attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Parent can view their child's attendance
    -- AND child belongs to parent's school
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = attendance.student_id
        AND psr.parent_user_id = (select auth.uid())
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update Teachers policy for attendance
DROP POLICY IF EXISTS "Teachers can view attendance for assigned classes" ON public.attendance;
CREATE POLICY "Teachers can view attendance for assigned classes" ON public.attendance
  FOR SELECT
  USING (
    -- Teacher can view attendance if they teach the subject in the student's class
    -- AND all belong to teacher's school
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = attendance.subject_id
        AND s.id = attendance.student_id
        AND cs.teacher_id = (select auth.uid())
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students s ON s.class_id = sub.class_id
      WHERE sub.id = attendance.subject_id
        AND s.id = attendance.student_id
        AND sub.teacher_id = (select auth.uid())
        AND sub.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Update INSERT/UPDATE/DELETE policy for attendance
DROP POLICY IF EXISTS "Teachers can manage attendance for assigned classes" ON public.attendance;
CREATE POLICY "Teachers can manage attendance for assigned classes" ON public.attendance
  FOR ALL
  USING (
    -- School_id must match
    school_id = public.get_user_school_id()
    AND
    -- Teacher must be assigned to teach this subject in the student's class
    EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.students s ON s.class_id = cs.class_id
      WHERE cs.subject_id = attendance.subject_id
        AND s.id = attendance.student_id
        AND cs.teacher_id = (select auth.uid())
        AND cs.school_id = public.get_user_school_id()
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Fallback: Teacher assigned directly to subject (for backward compatibility)
    (
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = attendance.subject_id
          AND s.id = attendance.student_id
          AND sub.teacher_id = (select auth.uid())
          AND sub.school_id = public.get_user_school_id()
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
    school_id = public.get_user_school_id()
    AND
    (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = attendance.subject_id
          AND s.id = attendance.student_id
          AND cs.teacher_id = (select auth.uid())
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = attendance.subject_id
          AND s.id = attendance.student_id
          AND sub.teacher_id = (select auth.uid())
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
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
    )
  );

-- ============================================================================
-- PART 3: VERIFY AND UPDATE STUDENTS RLS POLICIES
-- ============================================================================

-- Ensure students policies check school_id
-- Students can only see students from their school
DROP POLICY IF EXISTS "Users can view students from their school" ON public.students;
CREATE POLICY "Users can view students from their school" ON public.students
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- ============================================================================
-- PART 4: VERIFY AND UPDATE SUBJECTS RLS POLICIES
-- ============================================================================

-- Ensure subjects policies check school_id
DROP POLICY IF EXISTS "Users can view subjects from their school" ON public.subjects;
CREATE POLICY "Users can view subjects from their school" ON public.subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- ============================================================================
-- PART 5: VERIFY AND UPDATE CLASSES RLS POLICIES
-- ============================================================================

-- Ensure classes policies check school_id
DROP POLICY IF EXISTS "Users can view classes from their school" ON public.classes;
CREATE POLICY "Users can view classes from their school" ON public.classes
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- ============================================================================
-- PART 6: VERIFY AND UPDATE PARENT_STUDENT_RELATIONS RLS POLICIES
-- ============================================================================

-- Ensure parent-student relations policies check school_id
DROP POLICY IF EXISTS "Parents can view their relations" ON public.parent_student_relations;
CREATE POLICY "Parents can view their relations" ON public.parent_student_relations
  FOR SELECT
  USING (
    -- Parent can view their relations
    -- AND student belongs to parent's school
    parent_user_id = (select auth.uid())
    AND
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = parent_student_relations.student_id
        AND s.school_id = public.get_user_school_id()
    )
  );

COMMIT;
