-- =============================================================================
-- Schema alignment, reporting RPCs, login/access logging (production-grade).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. USERS VIEW (spec: users id, email, full_name, created_at)
-- =============================================================================
CREATE OR REPLACE VIEW public.users AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.created_at
FROM public.profiles p;

COMMENT ON VIEW public.users IS 'Read-only view over profiles for spec alignment. id=profiles.id, email, full_name, created_at.';

-- RLS: use same as profiles or restrict to own row / school
ALTER VIEW public.users SET (security_invoker = on);

-- =============================================================================
-- 2. USER_ROLES: add school_id (nullable) for multi-tenant role binding
-- =============================================================================
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.user_roles.school_id IS 'Optional: role applies to this school. NULL = global role for user.';

-- =============================================================================
-- 3. ADD_GRADE: persist grade_type (oral -> normal, written/exam -> lucrare_scrisa)
-- =============================================================================
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
  v_user_id := (select auth.uid());
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
    student_id, subject_id, grade, date, description, teacher_id, school_id, created_by, grade_type
  )
  VALUES (
    p_student_id, p_subject_id, p_value, p_date, NULLIF(trim(p_description), ''),
    v_user_id, v_school_id, v_user_id, v_grade_type
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

-- =============================================================================
-- 4. REPORTING: get_student_report (grades + attendance for PDF)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_student_report(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
  v_student RECORD;
  v_grades JSONB;
  v_attendance JSONB;
  v_averages JSONB;
  v_can_see BOOLEAN := false;
BEGIN
  v_user_id := (select auth.uid());
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();

  SELECT s.id, s.full_name, s.school_id, c.name AS class_name
  INTO v_student
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  WHERE s.id = p_student_id AND s.deleted_at IS NULL;

  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Student not found');
  END IF;

  IF v_school_id IS NOT NULL AND v_student.school_id <> v_school_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Permission: own data (student), parent (child), or staff/teacher for school
  v_can_see := EXISTS (SELECT 1 FROM public.students st WHERE st.id = p_student_id AND st.user_id = v_user_id)
    OR EXISTS (
      SELECT 1 FROM public.parent_student_relations psr
      WHERE psr.student_id = p_student_id AND psr.parent_user_id = v_user_id
    )
    OR (v_school_id IS NOT NULL AND (
      public.has_role(v_user_id, 'director'::public.app_role)
      OR public.has_role(v_user_id, 'secretariat'::public.app_role)
      OR public.has_role(v_user_id, 'teacher'::public.app_role)
      OR public.has_role(v_user_id, 'homeroom_teacher'::public.app_role)
      OR public.has_role(v_user_id, 'uat_admin'::public.app_role)
      OR public.has_role(v_user_id, 'developer'::public.app_role)
    ));

  IF NOT v_can_see THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', g.id, 'date', g.date, 'grade', g.grade, 'description', g.description,
      'subject_id', g.subject_id, 'subject_name', sub.name
    ) ORDER BY g.date DESC
  ), '[]'::jsonb)
  INTO v_grades
  FROM public.grades g
  LEFT JOIN public.subjects sub ON sub.id = g.subject_id
  WHERE g.student_id = p_student_id AND g.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id, 'date', a.date, 'status', a.status, 'is_excused', a.is_excused,
      'subject_id', a.subject_id, 'subject_name', sub.name
    ) ORDER BY a.date DESC
  ), '[]'::jsonb)
  INTO v_attendance
  FROM public.attendance a
  LEFT JOIN public.subjects sub ON sub.id = a.subject_id
  WHERE a.student_id = p_student_id AND a.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'subject_id', subject_id, 'subject_name', subject_name,
      'average', average, 'grade_count', grade_count
    )
  ), '[]'::jsonb)
  INTO v_averages
  FROM public.get_student_summary(p_student_id);

  RETURN jsonb_build_object(
    'success', true,
    'student_id', p_student_id,
    'student_name', v_student.full_name,
    'class_name', v_student.class_name,
    'grades', v_grades,
    'attendance', v_attendance,
    'subject_averages', v_averages
  );
END;
$$;

-- =============================================================================
-- 5. REPORTING: get_class_report (per-student summary for class)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_class_report(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
  v_class RECORD;
  v_students JSONB;
  v_can_see BOOLEAN := false;
BEGIN
  v_user_id := (select auth.uid());
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_school_id := public.get_user_school_id();

  SELECT c.id, c.name, c.school_id INTO v_class
  FROM public.classes c
  WHERE c.id = p_class_id;

  IF v_class.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Class not found');
  END IF;

  IF v_school_id IS NOT NULL AND v_class.school_id <> v_school_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  v_can_see := (v_school_id IS NOT NULL AND (
    public.has_role(v_user_id, 'director'::public.app_role)
    OR public.has_role(v_user_id, 'secretariat'::public.app_role)
    OR public.has_role(v_user_id, 'teacher'::public.app_role)
    OR public.has_role(v_user_id, 'homeroom_teacher'::public.app_role)
    OR public.has_role(v_user_id, 'uat_admin'::public.app_role)
    OR public.has_role(v_user_id, 'developer'::public.app_role)
  ));

  IF NOT v_can_see THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  WITH student_summaries AS (
    SELECT
      s.id AS student_id,
      s.full_name AS student_name,
      s.student_number AS student_number,
      (SELECT jsonb_agg(jsonb_build_object('subject_name', g.subject_name, 'average', g.subject_average))
       FROM public.get_student_summary(s.id) g) AS subject_averages,
      (SELECT sm.total_absences FROM public.get_student_summary(s.id) sm LIMIT 1) AS total_absences,
      (SELECT sm.general_average FROM public.get_student_summary(s.id) sm LIMIT 1) AS general_average
    FROM public.students s
    WHERE s.class_id = p_class_id AND s.school_id = v_class.school_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'student_id', student_id,
      'student_name', student_name,
      'student_number', student_number,
      'subject_averages', COALESCE(subject_averages, '[]'::jsonb),
      'total_absences', total_absences,
      'general_average', general_average
    ) ORDER BY student_number NULLS LAST, student_name
  ), '[]'::jsonb)
  INTO v_students
  FROM student_summaries;

  RETURN jsonb_build_object(
    'success', true,
    'class_id', p_class_id,
    'class_name', v_class.name,
    'students', v_students
  );
END;
$$;

-- =============================================================================
-- 6. LOGGING: log_login (called from Edge Function or auth hook)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_login(
  p_user_id UUID,
  p_email TEXT,
  p_success BOOLEAN,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_logs (user_id, email, success, ip_address, user_agent)
  VALUES (p_user_id, p_email, p_success, p_ip_address, p_user_agent);
END;
$$;

-- =============================================================================
-- 7. LOGGING: log_access (failed/success access to resources)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_access(
  p_user_id UUID,
  p_resource TEXT,
  p_action TEXT,
  p_success BOOLEAN,
  p_details JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.access_logs (user_id, resource, action, success, details)
  VALUES (p_user_id, p_resource, p_action, p_success, p_details);
END;
$$;

-- Allow service_role to call logging (Edge Function uses service role)
GRANT EXECUTE ON FUNCTION public.log_login TO service_role;
GRANT EXECUTE ON FUNCTION public.log_login TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_access TO service_role;
GRANT EXECUTE ON FUNCTION public.log_access TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_student_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_report TO authenticated;

COMMENT ON FUNCTION public.get_student_report IS 'Returns grades + attendance + averages for one student (for PDF report). RLS enforced.';
COMMENT ON FUNCTION public.get_class_report IS 'Returns per-student summary for a class (for class report / PDF).';
COMMENT ON FUNCTION public.log_login IS 'Insert login event. Call from Edge Function on auth sign-in/sign-out or failure.';
COMMENT ON FUNCTION public.log_access IS 'Insert access event (e.g. failed RPC). Call from Edge Function or RPC error handler.';

COMMIT;
