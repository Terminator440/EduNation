-- Migration: close_academic_year() - atomic close of academic year
-- Recalculates averages, copies to snapshot, sets year_closed, audits

BEGIN;

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

  -- Copy grades and averages to snapshot for each student in the school
  FOR v_student IN
    SELECT s.id
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE c.school_id = v_year.school_id AND c.year = v_year.year
  LOOP
    -- Per-subject snapshots
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
         WHERE a.student_id = v_student.id AND a.subject_id = v_subject.subject_id)
      )
      ON CONFLICT (academic_year_id, student_id, subject_id) DO UPDATE SET
        average = EXCLUDED.average,
        grades_json = EXCLUDED.grades_json,
        attendance_json = EXCLUDED.attendance_json;
    END LOOP;
  END LOOP;

  -- Mark year closed
  UPDATE public.academic_year
  SET year_closed = true, closed_at = now(), closed_by = v_user_id
  WHERE id = p_year_id;

  -- Audit
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

COMMIT;
