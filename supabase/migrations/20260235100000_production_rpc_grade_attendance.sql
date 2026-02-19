-- =============================================================================
-- Production RPC: add_grade, update_grade, delete_grade, mark_attendance.
-- All grade/attendance mutations go through these; no direct frontend writes.
-- =============================================================================

BEGIN;

-- Map spec type (oral, written, exam) to existing grade_type
-- oral -> normal, written -> lucrare_scrisa, exam -> lucrare_scrisa
CREATE OR REPLACE FUNCTION public.add_grade(
  p_student_id UUID,
  p_subject_id UUID,
  p_value NUMERIC,
  p_type TEXT DEFAULT 'oral',
  p_date DATE DEFAULT CURRENT_DATE,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_grade_type TEXT;
  v_grade_id UUID;
  v_row RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_value IS NULL OR p_value < 1 OR p_value > 10 OR p_value <> FLOOR(p_value) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade must be an integer between 1 and 10');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  IF NOT public.user_can_edit_grade(v_user_id, p_student_id, p_subject_id, v_school_id)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  IF public.is_semester_locked_for_grade(p_date, p_student_id) AND NOT public.is_supreme_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Semester is locked');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND school_id = v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Student not in your school');
  END IF;

  v_grade_type := CASE p_type
    WHEN 'written' THEN 'lucrare_scrisa'
    WHEN 'exam' THEN 'lucrare_scrisa'
    ELSE 'normal'
  END;

  INSERT INTO public.grades (
    student_id, subject_id, grade, date, description, teacher_id, school_id, created_by
  )
  VALUES (
    p_student_id, p_subject_id, p_value, p_date, NULLIF(trim(p_description), ''),
    v_user_id, v_school_id, v_user_id
  )
  RETURNING id INTO v_grade_id;

  SELECT g.id, g.grade, g.date, g.student_id, g.subject_id
  INTO v_row
  FROM public.grades g
  WHERE g.id = v_grade_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_grade_id,
    'grade', v_row.grade,
    'date', v_row.date,
    'student_id', v_row.student_id,
    'subject_id', v_row.subject_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_grade(
  p_grade_id UUID,
  p_new_value NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_student_id UUID;
  v_subject_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_new_value IS NULL OR p_new_value < 1 OR p_new_value > 10 OR p_new_value <> FLOOR(p_new_value) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade must be an integer between 1 and 10');
  END IF;

  SELECT g.student_id, g.subject_id, g.school_id INTO v_student_id, v_subject_id, v_school_id
  FROM public.grades g
  WHERE g.id = p_grade_id AND g.deleted_at IS NULL;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not found');
  END IF;

  IF v_school_id <> public.get_user_school_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not in your school');
  END IF;

  IF NOT public.user_can_edit_grade(v_user_id, v_student_id, v_subject_id, v_school_id)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed to edit this grade');
  END IF;

  IF public.is_semester_locked_for_grade((SELECT date FROM public.grades WHERE id = p_grade_id), v_student_id)
     AND NOT public.is_supreme_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Semester is locked');
  END IF;

  UPDATE public.grades
  SET grade = p_new_value, updated_by = v_user_id, teacher_id = v_user_id
  WHERE id = p_grade_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_grade_id, 'grade', p_new_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_grade(p_grade_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_student_id UUID;
  v_subject_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT g.student_id, g.subject_id, g.school_id INTO v_student_id, v_subject_id, v_school_id
  FROM public.grades g
  WHERE g.id = p_grade_id AND g.deleted_at IS NULL;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not found');
  END IF;

  IF v_school_id <> public.get_user_school_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not in your school');
  END IF;

  IF NOT public.user_can_edit_grade(v_user_id, v_student_id, v_subject_id, v_school_id)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed to delete this grade');
  END IF;

  IF public.is_semester_locked_for_grade((SELECT date FROM public.grades WHERE id = p_grade_id), v_student_id)
     AND NOT public.is_supreme_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Semester is locked');
  END IF;

  UPDATE public.grades
  SET deleted_at = now(), updated_by = v_user_id
  WHERE id = p_grade_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Grade not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_grade_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_student_id UUID,
  p_subject_id UUID,
  p_date DATE,
  p_status TEXT,
  p_is_excused BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_attendance_id UUID;
  v_existing_id UUID;
  v_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  v_status := CASE p_status
    WHEN 'present' THEN 'prezent'
    WHEN 'absent' THEN 'absent'
    WHEN 'excused' THEN 'motivat'
    ELSE COALESCE(NULLIF(trim(p_status), ''), 'absent')
  END;

  IF v_status NOT IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending', 'nemotivata', 'motivata', 'in_curs') THEN
    v_status := 'absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.students s ON s.class_id = ta.class_id
    WHERE ta.teacher_id = v_user_id AND ta.subject_id = p_subject_id AND s.id = p_student_id
      AND ta.school_id = v_school_id
  ) AND NOT public.has_role(v_user_id, 'director'::public.app_role)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  SELECT id INTO v_existing_id FROM public.attendance
  WHERE student_id = p_student_id AND subject_id = p_subject_id AND date = p_date AND (deleted_at IS NULL)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.attendance
    SET status = v_status, is_excused = COALESCE(p_is_excused, false), created_by = v_user_id
    WHERE id = v_existing_id;
    v_attendance_id := v_existing_id;
  ELSE
    INSERT INTO public.attendance (student_id, subject_id, date, status, is_excused, school_id, created_by)
    VALUES (p_student_id, p_subject_id, p_date, v_status, COALESCE(p_is_excused, false), v_school_id, v_user_id)
    RETURNING id INTO v_attendance_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_attendance_id,
    'student_id', p_student_id,
    'subject_id', p_subject_id,
    'date', p_date,
    'status', v_status
  );
END;
$$;

-- mark_attendance_upsert kept for backwards compat; primary is mark_attendance above
CREATE OR REPLACE FUNCTION public.mark_attendance_upsert(
  p_student_id UUID,
  p_subject_id UUID,
  p_date DATE,
  p_status TEXT,
  p_is_excused BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_attendance_id UUID;
  v_status TEXT;
  v_existing_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  v_status := CASE p_status
    WHEN 'present' THEN 'prezent'
    WHEN 'absent' THEN 'absent'
    WHEN 'excused' THEN 'motivat'
    ELSE COALESCE(NULLIF(trim(p_status), ''), 'absent')
  END;
  IF v_status NOT IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending', 'nemotivata', 'motivata', 'in_curs') THEN
    v_status := 'absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.students s ON s.class_id = ta.class_id
    WHERE ta.teacher_id = v_user_id AND ta.subject_id = p_subject_id AND s.id = p_student_id AND ta.school_id = v_school_id
  ) AND NOT public.has_role(v_user_id, 'director'::public.app_role)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  SELECT id INTO v_existing_id FROM public.attendance
  WHERE student_id = p_student_id AND subject_id = p_subject_id AND date = p_date AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.attendance
    SET status = v_status, is_excused = COALESCE(p_is_excused, false), created_by = v_user_id
    WHERE id = v_existing_id;
    v_attendance_id := v_existing_id;
  ELSE
    INSERT INTO public.attendance (student_id, subject_id, date, status, is_excused, school_id, created_by)
    VALUES (p_student_id, p_subject_id, p_date, v_status, COALESCE(p_is_excused, false), v_school_id, v_user_id)
    RETURNING id INTO v_attendance_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_attendance_id,
    'student_id', p_student_id,
    'subject_id', p_subject_id,
    'date', p_date,
    'status', v_status
  );
END;
$$;

-- delete_attendance: soft delete; permission check same as mark_attendance
CREATE OR REPLACE FUNCTION public.delete_attendance(p_attendance_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_row RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school associated');
  END IF;

  SELECT a.id, a.student_id, a.subject_id, a.school_id INTO v_row
  FROM public.attendance a
  WHERE a.id = p_attendance_id AND a.deleted_at IS NULL;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Attendance not found');
  END IF;

  IF v_row.school_id IS DISTINCT FROM v_school_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in your school');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.students s ON s.class_id = ta.class_id
    WHERE ta.teacher_id = v_user_id AND ta.subject_id = v_row.subject_id AND s.id = v_row.student_id
      AND ta.school_id = v_school_id
  ) AND NOT public.has_role(v_user_id, 'director'::public.app_role)
     AND NOT public.has_role(v_user_id, 'uat_admin'::public.app_role)
     AND NOT public.has_role(v_user_id, 'developer'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this class/subject');
  END IF;

  UPDATE public.attendance
  SET deleted_at = now()
  WHERE id = p_attendance_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('success', true, 'id', p_attendance_id);
END;
$$;

-- calculate_student_average (spec: per subject, per semester)
CREATE OR REPLACE FUNCTION public.calculate_student_average(
  p_student_id UUID,
  p_subject_id UUID,
  p_semester INTEGER DEFAULT NULL,
  p_academic_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  semester INTEGER,
  academic_year INTEGER,
  average NUMERIC(4,2),
  grade_count BIGINT,
  final_grade_rounded INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
BEGIN
  IF p_academic_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN v_year := v_year - 1; END IF;
  ELSE
    v_year := p_academic_year;
  END IF;

  RETURN QUERY
  SELECT
    sub.id AS subject_id,
    sub.name AS subject_name,
    public.get_semester_from_date(g.date) AS semester,
    v_year::INTEGER AS academic_year,
    ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2) AS average,
    COUNT(*)::BIGINT AS grade_count,
    public.round_final_grade_ro(ROUND(AVG(g.grade::NUMERIC), 2))::INTEGER AS final_grade_rounded
  FROM public.grades g
  JOIN public.subjects sub ON sub.id = g.subject_id
  WHERE g.student_id = p_student_id
    AND g.subject_id = p_subject_id
    AND g.deleted_at IS NULL
    AND (CASE WHEN EXTRACT(MONTH FROM g.date) IN (9,10,11,12) THEN EXTRACT(YEAR FROM g.date)
              ELSE EXTRACT(YEAR FROM g.date) - 1 END) = v_year
    AND (p_semester IS NULL OR public.get_semester_from_date(g.date) = p_semester)
  GROUP BY sub.id, sub.name, public.get_semester_from_date(g.date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_grade TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_grade TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_grade TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_attendance TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_attendance TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_student_average TO authenticated;

COMMENT ON FUNCTION public.add_grade IS 'Insert grade; validates 1-10, teacher assignment, semester lock. created_by set to auth.uid().';
COMMENT ON FUNCTION public.update_grade IS 'Update grade value; sets updated_by. Permission and lock checked.';
COMMENT ON FUNCTION public.delete_grade IS 'Soft delete grade (sets deleted_at). Logged in audit.';
COMMENT ON FUNCTION public.mark_attendance IS 'Insert or update attendance for student/subject/date. created_by set.';
COMMENT ON FUNCTION public.delete_attendance IS 'Soft delete attendance (sets deleted_at). Permission checked.';
COMMENT ON FUNCTION public.calculate_student_average IS 'Returns average and rounded final grade per subject/semester.';

COMMIT;
