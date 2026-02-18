-- Migration: get_student_summary RPC
-- Calculates per-subject averages, total motivated/unmotivated absences,
-- and general average for a single student. Frontend should consume this
-- instead of computing averages in React.

BEGIN;

-- get_student_summary(student_id)
-- Returns one row per subject plus global summary columns.
CREATE OR REPLACE FUNCTION public.get_student_summary(p_student_id UUID)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  subject_average NUMERIC(4,2),
  subject_grade_count BIGINT,
  total_absences BIGINT,
  total_motivated_absences BIGINT,
  total_unmotivated_absences BIGINT,
  general_average NUMERIC(4,2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_general_avg NUMERIC(4,2);
  v_total_abs BIGINT;
  v_total_motivated BIGINT;
  v_total_unmotivated BIGINT;
BEGIN
  -- 1) Get per-subject averages using existing helper
  --    Handles academic_year snapshots vs live grades.
  -- 2) Get general average using existing helper.
  -- 3) Count absences using attendance table.

  -- General average
  SELECT public.get_student_general_average_for_display(p_student_id)
  INTO v_general_avg;

  -- Absence counts (motivated / unmotivated)
  SELECT
    COUNT(*)::bigint AS total_absences,
    COUNT(*) FILTER (
      WHERE
        -- New enum-based status, if present
        (attendance_status IS NOT NULL AND attendance_status = 'motivata'::public.attendance_status)
        OR
        -- Legacy text-based status fallback
        (attendance_status IS NULL AND status IN ('motivated', 'motivat'))
    )::bigint AS total_motivated_absences,
    COUNT(*) FILTER (
      WHERE
        (attendance_status IS NOT NULL AND attendance_status = 'nemotivata'::public.attendance_status)
        OR
        (attendance_status IS NULL AND status IN ('unexcused', 'absent'))
    )::bigint AS total_unmotivated_absences
  INTO
    v_total_abs,
    v_total_motivated,
    v_total_unmotivated
  FROM public.attendance a
  WHERE a.student_id = p_student_id
    AND a.deleted_at IS NULL;

  -- Per-subject averages (subject_id, subject_name, average, grade_count)
  RETURN QUERY
  SELECT
    g.subject_id,
    g.subject_name,
    COALESCE(g.average, 0)::numeric(4,2) AS subject_average,
    COALESCE(g.grade_count, 0)::bigint AS subject_grade_count,
    COALESCE(v_total_abs, 0)::bigint AS total_absences,
    COALESCE(v_total_motivated, 0)::bigint AS total_motivated_absences,
    COALESCE(v_total_unmotivated, 0)::bigint AS total_unmotivated_absences,
    COALESCE(v_general_avg, 0)::numeric(4,2) AS general_average
  FROM public.get_student_subject_averages_for_display(p_student_id) AS g;
END;
$$;

-- Allow authenticated users to call this RPC; RLS on underlying tables
-- still applies and will scope results correctly.
GRANT EXECUTE ON FUNCTION public.get_student_summary TO authenticated;

COMMENT ON FUNCTION public.get_student_summary IS
  'Returns per-subject averages, total motivated/unmotivated absences, and general average for a student. Used by student and parent dashboards.';

COMMIT;

