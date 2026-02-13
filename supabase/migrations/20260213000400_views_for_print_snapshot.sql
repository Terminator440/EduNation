-- Migration: RPCs for PrintStudent/PrintClass - read from snapshot when year closed
-- Frontend calls these instead of querying grades/attendance directly

BEGIN;

-- get_student_grades_for_display(student_id): returns grades from snapshot if year closed, else live
CREATE OR REPLACE FUNCTION public.get_student_grades_for_display(p_student_id UUID)
RETURNS TABLE(
  id UUID,
  date DATE,
  grade NUMERIC,
  description TEXT,
  subject_id UUID,
  subject_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_closed BOOLEAN;
  v_year_id UUID;
BEGIN
  SELECT ay.id, ay.year_closed INTO v_year_id, v_year_closed
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  JOIN public.academic_year ay ON ay.school_id = c.school_id AND ay.year = c.year
  WHERE s.id = p_student_id
  LIMIT 1;

  IF v_year_closed AND v_year_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      gen_random_uuid() AS id,
      (g->>'date')::date AS date,
      (g->>'grade')::numeric AS grade,
      (g->>'description')::text AS description,
      ays.subject_id,
      ays.subject_name
    FROM public.academic_year_snapshots ays,
         jsonb_array_elements(COALESCE(ays.grades_json, '[]'::jsonb)) AS g
    WHERE ays.academic_year_id = v_year_id AND ays.student_id = p_student_id AND ays.subject_id IS NOT NULL;
  ELSE
    RETURN QUERY
    SELECT g.id, g.date, g.grade, g.description, g.subject_id, s.name AS subject_name
    FROM public.grades g
    JOIN public.subjects s ON s.id = g.subject_id
    WHERE g.student_id = p_student_id AND g.deleted_at IS NULL
    ORDER BY g.date DESC;
  END IF;
END;
$$;

-- Simplified: get_student_subject_averages_for_display - for Grades page (medii pe materii)
CREATE OR REPLACE FUNCTION public.get_student_subject_averages_for_display(p_student_id UUID)
RETURNS TABLE(subject_id UUID, subject_name TEXT, average NUMERIC, grade_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_closed BOOLEAN;
  v_year_id UUID;
BEGIN
  SELECT ay.id, ay.year_closed INTO v_year_id, v_year_closed
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.academic_year ay ON ay.school_id = c.school_id AND ay.year = c.year
  WHERE s.id = p_student_id
  LIMIT 1;

  IF v_year_closed AND v_year_id IS NOT NULL THEN
    RETURN QUERY
    SELECT ays.subject_id, ays.subject_name, ays.average, jsonb_array_length(COALESCE(ays.grades_json, '[]'::jsonb))::bigint
    FROM public.academic_year_snapshots ays
    WHERE ays.academic_year_id = v_year_id AND ays.student_id = p_student_id AND ays.subject_id IS NOT NULL;
  ELSE
    RETURN QUERY
    SELECT * FROM public.view_student_subject_average WHERE view_student_subject_average.student_id = p_student_id;
  END IF;
END;
$$;

-- get_subject_averages_for_students(student_ids[]): batch version for Grades/Reports
CREATE OR REPLACE FUNCTION public.get_subject_averages_for_students(p_student_ids UUID[])
RETURNS TABLE(student_id UUID, subject_id UUID, subject_name TEXT, average NUMERIC, grade_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sid UUID;
BEGIN
  FOREACH v_sid IN ARRAY p_student_ids
  LOOP
    RETURN QUERY
    SELECT v_sid, g.subject_id, g.subject_name, g.average, g.grade_count
    FROM public.get_student_subject_averages_for_display(v_sid) AS g;
  END LOOP;
END;
$$;

-- get_class_stats_for_display(class_id, date_from, date_to): for Reports - no frontend map/reduce
CREATE OR REPLACE FUNCTION public.get_class_stats_for_display(
  p_class_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE(student_id UUID, general_average NUMERIC, absences_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS student_id,
    (SELECT AVG(g.grade)::numeric(4,2) FROM public.grades g
     WHERE g.student_id = s.id AND g.deleted_at IS NULL
       AND (p_date_from IS NULL OR g.date >= p_date_from)
       AND (p_date_to IS NULL OR g.date <= p_date_to)) AS general_average,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     WHERE a.student_id = s.id AND a.status IN ('absent', 'unexcused', 'pending')
       AND (p_date_from IS NULL OR a.date >= p_date_from)
       AND (p_date_to IS NULL OR a.date <= p_date_to)) AS absences_count
  FROM public.students s
  WHERE s.class_id = p_class_id
  ORDER BY s.student_number NULLS LAST, s.full_name;
END;
$$;

-- get_class_totals_for_display: class avg, total absences, total motivated (no frontend aggregation)
CREATE OR REPLACE FUNCTION public.get_class_totals_for_display(
  p_class_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE(class_average NUMERIC, total_absences BIGINT, total_motivated BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT AVG(g.grade)::numeric(4,2) FROM public.grades g
     JOIN public.students s2 ON s2.id = g.student_id
     WHERE s2.class_id = p_class_id AND g.deleted_at IS NULL
       AND (p_date_from IS NULL OR g.date >= p_date_from)
       AND (p_date_to IS NULL OR g.date <= p_date_to)) AS class_average,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     JOIN public.students s2 ON s2.id = a.student_id
     WHERE s2.class_id = p_class_id AND a.status IN ('absent', 'unexcused', 'pending')
       AND (p_date_from IS NULL OR a.date >= p_date_from)
       AND (p_date_to IS NULL OR a.date <= p_date_to)) AS total_absences,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     JOIN public.students s2 ON s2.id = a.student_id
     WHERE s2.class_id = p_class_id AND a.status IN ('motivat', 'motivated')
       AND (p_date_from IS NULL OR a.date >= p_date_from)
       AND (p_date_to IS NULL OR a.date <= p_date_to)) AS total_motivated;
END;
$$;

-- get_student_general_average_for_display
CREATE OR REPLACE FUNCTION public.get_student_general_average_for_display(p_student_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_closed BOOLEAN;
  v_year_id UUID;
  v_avg NUMERIC;
BEGIN
  SELECT ay.id, ay.year_closed INTO v_year_id, v_year_closed
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.academic_year ay ON ay.school_id = c.school_id AND ay.year = c.year
  WHERE s.id = p_student_id
  LIMIT 1;

  IF v_year_closed AND v_year_id IS NOT NULL THEN
    SELECT AVG(average)::numeric(4,2) INTO v_avg
    FROM public.academic_year_snapshots
    WHERE academic_year_id = v_year_id AND student_id = p_student_id AND subject_id IS NOT NULL;
    RETURN v_avg;
  ELSE
    SELECT general_average INTO v_avg FROM public.view_student_general_average WHERE student_id = p_student_id;
    RETURN v_avg;
  END IF;
END;
$$;

COMMIT;
