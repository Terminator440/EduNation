-- Security Audit: RLS hardening
-- 1) Students table: students (role) must see ONLY their own row; no access to other students' records.
-- 2) Grades/Final_grades: explicit (select auth.uid()) IS NOT NULL so unauthenticated requests never pass.

BEGIN;

-- ============================================================================
-- PART 1: STUDENTS TABLE - Restrict SELECT by role ((select auth.uid()) binding)
-- ============================================================================
-- Previous policy "Users can view students from their school" allowed ANY user with
-- school_id (including students) to see ALL students in the school (data leak).
-- Replace with role-based: student sees only own row; parent only linked children;
-- staff/teachers see school; uat_admin/developer unchanged.

DROP POLICY IF EXISTS "Users can view students from their school" ON public.students;

-- Students (role): only their own student record(s) where user_id = (select auth.uid())
CREATE POLICY "Students can view own record only" ON public.students
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND user_id = (select auth.uid())
    AND school_id = public.get_user_school_id()
  );

-- Parents: only students linked via parent_student_relations, same school
CREATE POLICY "Parents can view linked children students" ON public.students
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = students.id
        AND psr.parent_user_id = (select auth.uid())
    )
    AND school_id = public.get_user_school_id()
  );

-- Staff and teachers: all students from their school (director, secretariat, homeroom, teacher)
CREATE POLICY "Staff and teachers can view students from school" ON public.students
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND (
      (
        school_id = public.get_user_school_id()
        AND (
          public.has_role((select auth.uid()), 'director'::public.app_role)
          OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
          OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
          OR public.has_role((select auth.uid()), 'teacher'::public.app_role)
        )
      )
      OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  );

-- ============================================================================
-- PART 2: GRADES - Explicit (select auth.uid()) IS NOT NULL for student/parent policies
-- ============================================================================
-- Ensure unauthenticated or anon never passes RLS (defense in depth).

DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = (select auth.uid())
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = (select auth.uid())
        AND s.school_id = public.get_user_school_id()
    )
  );

-- ============================================================================
-- PART 3: FINAL_GRADES - Explicit (select auth.uid()) IS NOT NULL
-- ============================================================================

DROP POLICY IF EXISTS "Students can view own final grades" ON public.final_grades;
CREATE POLICY "Students can view own final grades" ON public.final_grades
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = final_grades.student_id
        AND s.user_id = (select auth.uid())
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Parents can view children final grades" ON public.final_grades;
CREATE POLICY "Parents can view children final grades" ON public.final_grades
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = final_grades.student_id
        AND psr.parent_user_id = (select auth.uid())
        AND s.school_id = public.get_user_school_id()
    )
  );

-- Staff policy: require (select auth.uid()) and role check
DROP POLICY IF EXISTS "Staff can view final grades from school" ON public.final_grades;
CREATE POLICY "Staff can view final grades from school" ON public.final_grades
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND (
      (
        school_id = public.get_user_school_id()
        AND (
          public.has_role((select auth.uid()), 'director'::public.app_role)
          OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
        )
      )
      OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  );

-- Teachers policy for final_grades: bind to (select auth.uid()) explicitly (already has teacher_id = (select auth.uid()))
DROP POLICY IF EXISTS "Teachers can view final grades for assigned classes" ON public.final_grades;
CREATE POLICY "Teachers can view final grades for assigned classes" ON public.final_grades
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND (
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
    )
  );

COMMIT;
