-- RPC for Director dashboard: returns grade distribution (count per grade 1-10)
-- Used for BarChart visualization without fetching all rows
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
  WHERE g.grade >= 1 AND g.grade <= 10
  GROUP BY ROUND(g.grade)
  ORDER BY ROUND(g.grade);
$$;
