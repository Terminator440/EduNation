-- RPC for Director dashboard: returns grade count and average in one query
-- Avoids fetching thousands of rows to compute average in frontend
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
  FROM public.grades;
$$;
