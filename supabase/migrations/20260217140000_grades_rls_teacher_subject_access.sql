-- RLS Policies for Grades: Teacher-Subject Access Control
-- Implements strict access control based on teacher-subject assignment
-- 
-- INSERT/UPDATE/DELETE: Only teachers assigned to the subject can modify grades
-- SELECT: Students, their teachers, and parents can view grades

BEGIN;

-- Drop all existing grades policies to recreate with new rules
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
DROP POLICY IF EXISTS "Staff can manage grades" ON public.grades;
DROP POLICY IF EXISTS "Developers can view all grades" ON public.grades;

-- INSERT: Only teachers assigned to the subject can insert grades
CREATE POLICY "Teachers can insert grades (teacher-subject access)" ON public.grades
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id)
  );

-- UPDATE: Only teachers assigned to the subject can update grades
CREATE POLICY "Teachers can update grades (teacher-subject access)" ON public.grades
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id)
  )
  WITH CHECK (
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id)
  );

-- DELETE: Only teachers assigned to the subject can delete grades
CREATE POLICY "Teachers can delete grades (teacher-subject access)" ON public.grades
  FOR DELETE
  USING (
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id)
  );

-- SELECT: Students, their teachers, and parents can view grades
-- Rule: auth.uid() = student_id OR auth.uid() = teacher_id OR auth.uid() IN (SELECT parent_user_id FROM parent_student_relations WHERE student_id = grades.student_id)
-- Implementation: 
--   - student_id in grades references students.id, so we check students.user_id
--   - teacher_id in grades is the user_id of the teacher
CREATE POLICY "Students teachers and parents can view grades" ON public.grades
  FOR SELECT
  USING (
    -- Student can view their own grades (auth.uid() matches students.user_id where students.id = student_id)
    auth.uid() IN (SELECT user_id FROM public.students WHERE id = student_id AND user_id IS NOT NULL)
    OR
    -- Teacher can view grades (auth.uid() = teacher_id in grades table)
    (auth.uid() = teacher_id AND teacher_id IS NOT NULL)
    OR
    -- Teacher assigned to the subject can view grades (auth.uid() matches subjects.teacher_id)
    auth.uid() IN (SELECT teacher_id FROM public.subjects WHERE id = subject_id AND teacher_id IS NOT NULL)
    OR
    -- Parent can view their child's grades (via parent_student_relations)
    auth.uid() IN (
      SELECT parent_user_id 
      FROM public.parent_student_relations 
      WHERE student_id = grades.student_id
    )
  );

-- Staff (Director/Secretariat/UAT Admin) can manage all grades
CREATE POLICY "Staff can manage all grades" ON public.grades
  FOR ALL
  USING (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- Developers can view all grades (for debugging)
CREATE POLICY "Developers can view all grades" ON public.grades
  FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));

COMMIT;
