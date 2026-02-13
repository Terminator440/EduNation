-- Run this in Supabase SQL Editor to add contact_email and create/update Reports RPCs.
-- Idempotent: safe to run multiple times.

-- 1. Add contact_email to students if it doesn't exist
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- 2. get_class_stats_for_display: student names, grades (general_average), attendance totals
CREATE OR REPLACE FUNCTION public.get_class_stats_for_display(
  p_class_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE(
  student_id UUID,
  student_name TEXT,
  general_average NUMERIC,
  absences_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name AS student_name,
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

-- 3. get_class_totals_for_display: class average, total absences, total motivated
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
