-- 1) Ensure student_number accepts EN-XXXXX (TEXT). Idempotent: only alter if column is still integer.
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'student_number';
  IF col_type = 'integer' THEN
    ALTER TABLE public.students
      ALTER COLUMN student_number TYPE TEXT
      USING (CASE WHEN student_number IS NULL THEN NULL ELSE 'EN-' || LPAD((student_number)::text, 5, '0') END);
  END IF;
END $$;

-- 2) Allow homeroom_teacher to INSERT/UPDATE/DELETE students only in their own class.
--    (Secretariat/director already have "Secretariat can manage all students".)
DROP POLICY IF EXISTS "Homeroom can manage students in own class" ON public.students;
CREATE POLICY "Homeroom can manage students in own class" ON public.students
  FOR ALL
  USING (
    has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
  );
