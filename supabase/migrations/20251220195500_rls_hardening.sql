-- RLS hardening for production safety
-- Goal: prevent teachers from inserting/updating grades/attendance for students/subjects outside their scope.

BEGIN;

-- Grades: drop permissive policies (created in initial schema) and recreate stricter ones
DROP POLICY IF EXISTS "Teachers can insert grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update their grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can delete their grades" ON public.grades;

-- Teachers can insert grades only for:
--  - students in their own class (classes.teacher_id = (select auth.uid()))
--  - subjects assigned to them (subjects.teacher_id = (select auth.uid()))
--  - teacher_id set to (select auth.uid())
DROP POLICY IF EXISTS "Teachers can insert grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can insert grades (scoped)" ON public.grades
  FOR INSERT WITH CHECK (
    teacher_id = (select auth.uid())
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()))
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = (select auth.uid())
    )
  );

-- Teachers can update/delete only the grades they created AND still within the same scope
DROP POLICY IF EXISTS "Teachers can update grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can update grades (scoped)" ON public.grades
  FOR UPDATE USING (
    teacher_id = (select auth.uid())
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()))
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = (select auth.uid())
    )
  )
  WITH CHECK (
    teacher_id = (select auth.uid())
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()))
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Teachers can delete grades (scoped)" ON public.grades;
CREATE POLICY "Teachers can delete grades (scoped)" ON public.grades
  FOR DELETE USING (
    teacher_id = (select auth.uid())
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()))
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = (select auth.uid())
    )
  );

-- Attendance: tighten management policy
DROP POLICY IF EXISTS "Teachers can manage attendance" ON public.attendance;

DROP POLICY IF EXISTS "Teachers can manage attendance (scoped)" ON public.attendance;
CREATE POLICY "Teachers can manage attendance (scoped)" ON public.attendance
  FOR ALL USING (
    teacher_id = (select auth.uid())
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()))
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = (select auth.uid())
    )
  )
  WITH CHECK (
    teacher_id = (select auth.uid())
    AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = (select auth.uid()))
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = (select auth.uid())
    )
  );

-- Helpful indexes for scoped policies (performance)
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON public.subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);

COMMIT;
