-- Soft Delete: RPCs and views that read from grades/attendance must exclude deleted_at IS NOT NULL.

-- 1) get_school_grades_stats: count and average only non-deleted grades
CREATE OR REPLACE FUNCTION public.get_school_grades_stats()
RETURNS TABLE(total_count bigint, average_grade numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    ROUND(AVG(grade)::numeric, 2) AS average_grade
  FROM public.grades
  WHERE deleted_at IS NULL;
$$;

-- 2) get_grades_distribution: only non-deleted grades
CREATE OR REPLACE FUNCTION public.get_grades_distribution()
RETURNS TABLE(grade int, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROUND(g.grade)::int AS grade,
    COUNT(*)::bigint AS cnt
  FROM public.grades g
  WHERE g.deleted_at IS NULL
    AND g.grade >= 1 AND g.grade <= 10
  GROUP BY ROUND(g.grade)
  ORDER BY ROUND(g.grade);
$$;

-- 3) close_academic_year: snapshot attendance only non-deleted rows
CREATE OR REPLACE FUNCTION public.close_academic_year(p_year_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year RECORD;
  v_student RECORD;
  v_subject RECORD;
  v_user_id UUID;
  v_user_name TEXT;
  v_role app_role;
BEGIN
  v_user_id := (select auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (has_role(v_user_id, 'director'::app_role) OR has_role(v_user_id, 'secretariat'::app_role) OR has_role(v_user_id, 'uat_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only director, secretariat or uat_admin can close academic year';
  END IF;

  SELECT ay.* INTO v_year
  FROM public.academic_year ay
  WHERE ay.id = p_year_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic year not found';
  END IF;

  IF v_year.year_closed THEN
    RAISE EXCEPTION 'Academic year is already closed';
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'director'::app_role)
  INTO v_user_name, v_role
  FROM public.profiles p WHERE p.id = v_user_id;

  FOR v_student IN
    SELECT s.id
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE c.school_id = v_year.school_id AND c.year = v_year.year
  LOOP
    FOR v_subject IN
      SELECT *
      FROM public.view_student_subject_average
      WHERE student_id = v_student.id
    LOOP
      INSERT INTO public.academic_year_snapshots (
        academic_year_id, student_id, subject_id, subject_name, average,
        grades_json, attendance_json
      )
      VALUES (
        p_year_id, v_student.id, v_subject.subject_id, v_subject.subject_name, v_subject.average,
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object('date', g.date, 'grade', g.grade, 'description', g.description)
        ), '[]'::jsonb)
         FROM public.grades g
         WHERE g.student_id = v_student.id AND g.subject_id = v_subject.subject_id AND g.deleted_at IS NULL),
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object('date', a.date, 'status', a.status)
        ), '[]'::jsonb)
         FROM public.attendance a
         WHERE a.student_id = v_student.id AND a.subject_id = v_subject.subject_id AND a.deleted_at IS NULL)
      )
      ON CONFLICT (academic_year_id, student_id, subject_id) DO UPDATE SET
        average = EXCLUDED.average,
        grades_json = EXCLUDED.grades_json,
        attendance_json = EXCLUDED.attendance_json;
    END LOOP;
  END LOOP;

  UPDATE public.academic_year
  SET year_closed = true, closed_at = now(), closed_by = v_user_id
  WHERE id = p_year_id;

  INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, details, school_id)
  VALUES (
    v_user_id, COALESCE(v_user_name, ''), v_role,
    'academic_year.closed', 'academic_year', p_year_id,
    jsonb_build_object('year_id', p_year_id, 'year', v_year.year, 'school_id', v_year.school_id),
    v_year.school_id
  );

  RETURN true;
END;
$$;

-- 4) motivate_attendance: only allow for non-deleted attendance rows
CREATE OR REPLACE FUNCTION public.motivate_attendance(
  p_attendance_id UUID,
  p_justification_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  subject_id UUID,
  date DATE,
  attendance_status public.attendance_status,
  justification_url TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_status public.attendance_status;
  v_student_class_id UUID;
  v_homeroom_teacher_id UUID;
BEGIN
  v_user_id := (select auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user_id, 'homeroom_teacher'::app_role) OR
    public.has_role(v_user_id, 'director'::app_role) OR
    public.has_role(v_user_id, 'secretariat'::app_role) OR
    public.has_role(v_user_id, 'uat_admin'::app_role) OR
    public.has_role(v_user_id, 'developer'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only homeroom_teacher, director, or secretariat can motivate attendance';
  END IF;

  SELECT
    a.attendance_status,
    s.class_id,
    c.teacher_id
  INTO
    v_current_status,
    v_student_class_id,
    v_homeroom_teacher_id
  FROM public.attendance a
  JOIN public.students s ON s.id = a.student_id
  LEFT JOIN public.classes c ON c.id = s.class_id
  WHERE a.id = p_attendance_id AND a.deleted_at IS NULL;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  IF v_current_status != 'nemotivata'::public.attendance_status THEN
    RAISE EXCEPTION 'Can only motivate attendance with status "nemotivata". Current status: %', v_current_status;
  END IF;

  IF public.has_role(v_user_id, 'homeroom_teacher'::app_role) THEN
    IF v_homeroom_teacher_id != v_user_id THEN
      RAISE EXCEPTION 'Homeroom teacher can only motivate attendance for students in their own class';
    END IF;
  END IF;

  UPDATE public.attendance
  SET
    attendance_status = 'motivata'::public.attendance_status,
    justification_url = COALESCE(p_justification_url, justification_url),
    validated_by = v_user_id,
    validated_at = now()
  WHERE id = p_attendance_id AND deleted_at IS NULL;

  RETURN QUERY
  SELECT
    a.id,
    a.student_id,
    a.subject_id,
    a.date,
    a.attendance_status,
    a.justification_url,
    a.validated_at AS updated_at
  FROM public.attendance a
  WHERE a.id = p_attendance_id AND a.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.motivate_attendance(UUID, TEXT) TO authenticated;
COMMENT ON FUNCTION public.motivate_attendance(UUID, TEXT) IS 'Changes attendance status from "nemotivata" to "motivata". Only non-deleted rows. Only homeroom_teacher (for their class), director, or secretariat.';
