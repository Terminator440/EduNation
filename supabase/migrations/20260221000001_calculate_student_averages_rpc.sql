-- Migration: calculate_student_averages RPC function
-- Calculates arithmetic average of grades per student, per subject, per semester
-- UI consumes only the final result, no local math calculations

BEGIN;

-- Helper function to determine semester from date
-- Semester 1: September (9) - January (1) of next year
-- Semester 2: February (2) - June (6)
CREATE OR REPLACE FUNCTION public.get_semester_from_date(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  month_val INTEGER;
BEGIN
  month_val := EXTRACT(MONTH FROM p_date);
  
  -- Semester 1: September (9), October (10), November (11), December (12), January (1)
  IF month_val IN (9, 10, 11, 12, 1) THEN
    RETURN 1;
  -- Semester 2: February (2), March (3), April (4), May (5), June (6)
  ELSIF month_val IN (2, 3, 4, 5, 6) THEN
    RETURN 2;
  ELSE
    -- July (7) and August (8) are summer break, default to semester 2 of previous year
    -- or could be considered as part of semester 2
    RETURN 2;
  END IF;
END;
$$;

-- Main RPC function: calculate_student_averages
-- Returns averages per student, per subject, per semester
CREATE OR REPLACE FUNCTION public.calculate_student_averages(
  p_student_id UUID DEFAULT NULL,
  p_subject_id UUID DEFAULT NULL,
  p_semester INTEGER DEFAULT NULL,
  p_academic_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  subject_id UUID,
  subject_name TEXT,
  semester INTEGER,
  academic_year INTEGER,
  average NUMERIC(4,2),
  grade_count BIGINT,
  grades JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_year INTEGER;
BEGIN
  -- Determine academic year if not provided
  IF p_academic_year IS NULL THEN
    v_current_year := EXTRACT(YEAR FROM CURRENT_DATE);
    -- If we're in January, we're still in the previous academic year
    IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN
      v_current_year := v_current_year - 1;
    END IF;
  ELSE
    v_current_year := p_academic_year;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name AS student_name,
    sub.id AS subject_id,
    sub.name AS subject_name,
    public.get_semester_from_date(g.date) AS semester,
    CASE 
      WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
      WHEN EXTRACT(MONTH FROM g.date) IN (1, 2, 3, 4, 5, 6) THEN EXTRACT(YEAR FROM g.date) - 1
      ELSE EXTRACT(YEAR FROM g.date) - 1
    END::INTEGER AS academic_year,
    ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2) AS average,
    COUNT(*)::BIGINT AS grade_count,
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'grade', g.grade,
        'date', g.date,
        'description', g.description,
        'teacher_id', g.teacher_id
      ) ORDER BY g.date
    ) AS grades
  FROM public.grades g
  INNER JOIN public.students s ON s.id = g.student_id
  INNER JOIN public.subjects sub ON sub.id = g.subject_id
  WHERE g.deleted_at IS NULL
    AND (p_student_id IS NULL OR g.student_id = p_student_id)
    AND (p_subject_id IS NULL OR g.subject_id = p_subject_id)
    AND (
      CASE 
        WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
        WHEN EXTRACT(MONTH FROM g.date) IN (1, 2, 3, 4, 5, 6) THEN EXTRACT(YEAR FROM g.date) - 1
        ELSE EXTRACT(YEAR FROM g.date) - 1
      END = v_current_year
    )
    AND (p_semester IS NULL OR public.get_semester_from_date(g.date) = p_semester)
  GROUP BY
    s.id,
    s.full_name,
    sub.id,
    sub.name,
    public.get_semester_from_date(g.date),
    CASE 
      WHEN EXTRACT(MONTH FROM g.date) IN (9, 10, 11, 12) THEN EXTRACT(YEAR FROM g.date)
      WHEN EXTRACT(MONTH FROM g.date) IN (1, 2, 3, 4, 5, 6) THEN EXTRACT(YEAR FROM g.date) - 1
      ELSE EXTRACT(YEAR FROM g.date) - 1
    END
  ORDER BY
    s.full_name,
    sub.name,
    public.get_semester_from_date(g.date);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.calculate_student_averages TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_semester_from_date TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.calculate_student_averages IS 'Calculates arithmetic average of grades per student, per subject, per semester. Returns structured data ready for UI consumption.';
COMMENT ON FUNCTION public.get_semester_from_date IS 'Helper function to determine semester (1 or 2) from a date. Semester 1: Sep-Jan, Semester 2: Feb-Jun.';

COMMIT;
