-- Migration: RLS policies to enforce school_id filtering
-- Ensures users can only access data from their own school

BEGIN;

-- Helper function to get user's school_id
CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = (select auth.uid())
$$;

-- 1) Students RLS: Users can only see students from their school
DROP POLICY IF EXISTS "Users can view students from their school" ON public.students;
CREATE POLICY "Users can view students from their school" ON public.students
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage students from their school" ON public.students;
CREATE POLICY "Staff can manage students from their school" ON public.students
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 2) Subjects RLS: Users can only see subjects from their school
DROP POLICY IF EXISTS "Users can view subjects from their school" ON public.subjects;
CREATE POLICY "Users can view subjects from their school" ON public.subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage subjects from their school" ON public.subjects;
CREATE POLICY "Staff can manage subjects from their school" ON public.subjects
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role) OR
        public.has_role((select auth.uid()), 'teacher'::app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 3) Grades RLS: Users can only see grades from their school
-- Update existing policies to include school_id check
DROP POLICY IF EXISTS "Users can view grades from their school" ON public.grades;
CREATE POLICY "Users can view grades from their school" ON public.grades
  FOR SELECT
  USING (
    (
      school_id = public.get_user_school_id() AND
      deleted_at IS NULL
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- Update insert policy to require school_id match
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can insert grades (scoped)" ON public.grades
  FOR INSERT
  WITH CHECK (
    school_id = public.get_user_school_id() AND
    teacher_id = (select auth.uid()) AND
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()) AND school_id = public.get_user_school_id()) AND
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = (select auth.uid()) AND s.school_id = public.get_user_school_id()
    ) OR
    public.has_role((select auth.uid()), 'director'::app_role) OR
    public.has_role((select auth.uid()), 'secretariat'::app_role) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- Update update policy
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can update grades (scoped)" ON public.grades
  FOR UPDATE
  USING (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = (select auth.uid()) AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()) AND school_id = public.get_user_school_id())
    ) OR
    public.has_role((select auth.uid()), 'director'::app_role) OR
    public.has_role((select auth.uid()), 'secretariat'::app_role) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = (select auth.uid()) AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()) AND school_id = public.get_user_school_id())
    ) OR
    public.has_role((select auth.uid()), 'director'::app_role) OR
    public.has_role((select auth.uid()), 'secretariat'::app_role) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- Update delete policy
DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can delete grades (scoped)" ON public.grades
  FOR DELETE
  USING (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = (select auth.uid()) AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()) AND school_id = public.get_user_school_id())
    ) OR
    public.has_role((select auth.uid()), 'director'::app_role) OR
    public.has_role((select auth.uid()), 'secretariat'::app_role) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 4) Attendance RLS: Users can only see attendance from their school
DROP POLICY IF EXISTS "Users can view attendance from their school" ON public.attendance;
CREATE POLICY "Users can view attendance from their school" ON public.attendance
  FOR SELECT
  USING (
    (
      school_id = public.get_user_school_id() AND
      deleted_at IS NULL
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- Update insert policy
DROP POLICY IF EXISTS "Teachers can insert attendance (scoped)" ON public.attendance;
CREATE POLICY "Teachers can insert attendance (scoped)" ON public.attendance
  FOR INSERT
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = (select auth.uid()) AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()) AND school_id = public.get_user_school_id()) AND
      student_id IN (
        SELECT s.id
        FROM public.students s
        JOIN public.classes c ON s.class_id = c.id
        WHERE c.teacher_id = (select auth.uid()) AND s.school_id = public.get_user_school_id()
      )
    ) OR
    public.has_role((select auth.uid()), 'director'::app_role) OR
    public.has_role((select auth.uid()), 'secretariat'::app_role) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- Update update policy
DROP POLICY IF EXISTS "Teachers can update attendance (scoped)" ON public.attendance;
CREATE POLICY "Teachers can update attendance (scoped)" ON public.attendance
  FOR UPDATE
  USING (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = (select auth.uid()) AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()) AND school_id = public.get_user_school_id())
    ) OR
    public.has_role((select auth.uid()), 'director'::app_role) OR
    public.has_role((select auth.uid()), 'secretariat'::app_role) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = (select auth.uid()) AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()) AND school_id = public.get_user_school_id())
    ) OR
    public.has_role((select auth.uid()), 'director'::app_role) OR
    public.has_role((select auth.uid()), 'secretariat'::app_role) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- Update delete policy
DROP POLICY IF EXISTS "Teachers can delete attendance (scoped)" ON public.attendance;
CREATE POLICY "Teachers can delete attendance (scoped)" ON public.attendance
  FOR DELETE
  USING (
    (
      school_id = public.get_user_school_id() AND
      teacher_id = (select auth.uid()) AND
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()) AND school_id = public.get_user_school_id())
    ) OR
    public.has_role((select auth.uid()), 'director'::app_role) OR
    public.has_role((select auth.uid()), 'secretariat'::app_role) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

-- 5) Classes RLS: Users can only see classes from their school
DROP POLICY IF EXISTS "Users can view classes from their school" ON public.classes;
CREATE POLICY "Users can view classes from their school" ON public.classes
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage classes from their school" ON public.classes;
CREATE POLICY "Staff can manage classes from their school" ON public.classes
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::app_role) OR
    public.has_role((select auth.uid()), 'developer'::app_role)
  );

COMMIT;
