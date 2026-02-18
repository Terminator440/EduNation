-- Soft Delete: ensure grades and attendance use deleted_at; all RLS SELECT policies
-- must exclude soft-deleted rows (deleted_at IS NULL). App already does soft delete
-- via UPDATE ... SET deleted_at = now() instead of DELETE.

BEGIN;

-- 1) Ensure columns exist (already added in 20251222190000_audit_status_requests_register.sql)
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.grades.deleted_at IS 'Soft delete: when set, row is hidden from all SELECT policies and app queries.';
COMMENT ON COLUMN public.attendance.deleted_at IS 'Soft delete: when set, row is hidden from all SELECT policies and app queries.';

-- 2) GRADES: Recreate all SELECT policies with AND (deleted_at IS NULL)
--    (UPDATE/INSERT/DELETE unchanged; soft delete is done via UPDATE)

DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
CREATE POLICY "Parents can view children grades" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Teachers can view grades for assigned classes" ON public.grades;
CREATE POLICY "Teachers can view grades for assigned classes" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = grades.subject_id
          AND s.id = grades.student_id
          AND cs.teacher_id = auth.uid()
          AND cs.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.subjects sub
        JOIN public.students s ON s.class_id = sub.class_id
        WHERE sub.id = grades.subject_id
          AND s.id = grades.student_id
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
  );

DROP POLICY IF EXISTS "Staff can view all grades from school" ON public.grades;
CREATE POLICY "Staff can view all grades from school" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      (public.has_role(auth.uid(), 'director'::public.app_role) OR
       public.has_role(auth.uid(), 'secretariat'::public.app_role))
      AND school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Admins can view all grades" ON public.grades;
CREATE POLICY "Admins can view all grades" ON public.grades
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- 3) ATTENDANCE: Recreate all SELECT and ALL policies with AND (deleted_at IS NULL) in USING
--    so soft-deleted rows are hidden; UPDATE still allowed on non-deleted rows (to set deleted_at)

DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = attendance.student_id
        AND s.user_id = auth.uid()
        AND s.user_id IS NOT NULL
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
CREATE POLICY "Parents can view children attendance" ON public.attendance
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = attendance.student_id
        AND psr.parent_user_id = auth.uid()
        AND s.school_id = public.get_user_school_id()
    )
  );

DROP POLICY IF EXISTS "Teachers can view attendance for assigned classes" ON public.attendance;
CREATE POLICY "Teachers can view attendance for assigned classes" ON public.attendance
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = attendance.subject_id
          AND s.id = attendance.student_id
          AND cs.teacher_id = auth.uid()
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
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
    )
  );

-- Teachers can manage: SELECT only non-deleted; UPDATE/DELETE apply to rows (so they can set deleted_at via UPDATE)
DROP POLICY IF EXISTS "Teachers can manage attendance for assigned classes" ON public.attendance;
CREATE POLICY "Teachers can manage attendance for assigned classes" ON public.attendance
  FOR ALL
  USING (
    (deleted_at IS NULL)
    AND (
      school_id = public.get_user_school_id()
      AND (
        EXISTS (
          SELECT 1
          FROM public.class_subjects cs
          JOIN public.students s ON s.class_id = cs.class_id
          WHERE cs.subject_id = attendance.subject_id
            AND s.id = attendance.student_id
            AND cs.teacher_id = auth.uid()
            AND cs.school_id = public.get_user_school_id()
            AND s.school_id = public.get_user_school_id()
        )
        OR
        (
          EXISTS (
            SELECT 1
            FROM public.subjects sub
            JOIN public.students s ON s.class_id = sub.class_id
            WHERE sub.id = attendance.subject_id
              AND s.id = attendance.student_id
              AND sub.teacher_id = auth.uid()
              AND sub.school_id = public.get_user_school_id()
              AND s.school_id = public.get_user_school_id()
          )
        )
        OR
        (
          (public.has_role(auth.uid(), 'director'::public.app_role) OR
           public.has_role(auth.uid(), 'secretariat'::public.app_role))
          AND school_id = public.get_user_school_id()
        )
        OR
        public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
        public.has_role(auth.uid(), 'developer'::public.app_role)
      )
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.subject_id = attendance.subject_id
          AND s.id = attendance.student_id
          AND cs.teacher_id = auth.uid()
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
          AND sub.teacher_id = auth.uid()
          AND sub.school_id = public.get_user_school_id()
          AND s.school_id = public.get_user_school_id()
      )
      OR
      (
        (public.has_role(auth.uid(), 'director'::public.app_role) OR
         public.has_role(auth.uid(), 'secretariat'::public.app_role))
        AND school_id = public.get_user_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- 4) Homeroom/Director attendance policies: exclude soft-deleted rows
DROP POLICY IF EXISTS "Homeroom teachers can view class attendance" ON public.attendance;
CREATE POLICY "Homeroom teachers can view class attendance" ON public.attendance
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND school_id = public.get_user_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Homeroom teachers can update attendance status" ON public.attendance;
CREATE POLICY "Homeroom teachers can update attendance status" ON public.attendance
  FOR UPDATE
  USING (
    (deleted_at IS NULL)
    AND school_id = public.get_user_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Directors and secretariat can update attendance status" ON public.attendance;
CREATE POLICY "Directors and secretariat can update attendance status" ON public.attendance
  FOR UPDATE
  USING (
    (deleted_at IS NULL)
    AND (
      public.has_role(auth.uid(), 'director'::public.app_role) OR
      public.has_role(auth.uid(), 'secretariat'::public.app_role)
    )
    AND school_id = public.get_user_school_id()
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'director'::public.app_role) OR
      public.has_role(auth.uid(), 'secretariat'::public.app_role)
    )
    AND school_id = public.get_user_school_id()
  );

COMMIT;
