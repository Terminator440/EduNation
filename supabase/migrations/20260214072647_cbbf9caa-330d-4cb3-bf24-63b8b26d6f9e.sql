-- Create RPC functions for Reports page

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
    vga.general_average,
    COALESCE(vas.total_absences, 0) AS absences_count
  FROM students s
  LEFT JOIN v_student_general_averages vga ON vga.student_id = s.id
  LEFT JOIN v_student_absence_summary vas ON vas.student_id = s.id
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
    ROUND(AVG(vga.general_average), 2) AS class_average,
    COALESCE(SUM(vas.total_absences), 0) AS total_absences,
    COALESCE(SUM(vas.motivated), 0) AS total_motivated
  FROM students s
  LEFT JOIN v_student_general_averages vga ON vga.student_id = s.id
  LEFT JOIN v_student_absence_summary vas ON vas.student_id = s.id
  WHERE s.class_id = p_class_id;
$$;
