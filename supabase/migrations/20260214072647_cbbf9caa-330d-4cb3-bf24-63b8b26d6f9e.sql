-- Create RPC functions for Reports page (inline subqueries - no dependency on v_student_* views)

CREATE OR REPLACE FUNCTION public.get_class_stats_for_display(
  p_class_id uuid,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS TABLE(student_id uuid, student_name text, general_average numeric, absences_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS student_id,
    s.full_name AS student_name,
    (SELECT AVG(g.grade)::numeric(4,2) FROM public.grades g
     WHERE g.student_id = s.id AND g.deleted_at IS NULL
       AND (p_date_from IS NULL OR g.date >= p_date_from::date)
       AND (p_date_to IS NULL OR g.date <= p_date_to::date)) AS general_average,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     WHERE a.student_id = s.id AND a.status IN ('absent', 'unexcused', 'pending', 'nemotivata')
       AND (p_date_from IS NULL OR a.date >= p_date_from::date)
       AND (p_date_to IS NULL OR a.date <= p_date_to::date)) AS absences_count
  FROM public.students s
  WHERE s.class_id = p_class_id
  ORDER BY s.student_number ASC NULLS LAST, s.full_name ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_class_totals_for_display(
  p_class_id uuid,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS TABLE(class_average numeric, total_absences bigint, total_motivated bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT ROUND(AVG(g.grade), 2)::numeric FROM public.grades g
     JOIN public.students s2 ON s2.id = g.student_id
     WHERE s2.class_id = p_class_id AND g.deleted_at IS NULL
       AND (p_date_from IS NULL OR g.date >= p_date_from::date)
       AND (p_date_to IS NULL OR g.date <= p_date_to::date)) AS class_average,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     JOIN public.students s2 ON s2.id = a.student_id
     WHERE s2.class_id = p_class_id AND a.status IN ('absent', 'unexcused', 'pending', 'nemotivata')
       AND (p_date_from IS NULL OR a.date >= p_date_from::date)
       AND (p_date_to IS NULL OR a.date <= p_date_to::date)) AS total_absences,
    (SELECT COUNT(*)::bigint FROM public.attendance a
     JOIN public.students s2 ON s2.id = a.student_id
     WHERE s2.class_id = p_class_id AND a.status IN ('motivat', 'motivated', 'motivata')
       AND (p_date_from IS NULL OR a.date >= p_date_from::date)
       AND (p_date_to IS NULL OR a.date <= p_date_to::date)) AS total_motivated;
$$;
