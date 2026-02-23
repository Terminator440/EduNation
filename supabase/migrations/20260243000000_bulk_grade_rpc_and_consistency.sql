-- RPC: add same grade to all students in a class (for one subject/date). Teacher must be assigned.
CREATE OR REPLACE FUNCTION public.add_grade_bulk(
  p_class_id uuid,
  p_subject_id uuid,
  p_value integer,
  p_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_teacher_id uuid;
  v_student_id uuid;
  v_count int := 0;
  v_err text;
  v_res jsonb;
BEGIN
  IF p_value IS NULL OR p_value < 1 OR p_value > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nota trebuie între 1 și 10', 'count', 0);
  END IF;

  SELECT school_id INTO v_school_id FROM classes WHERE id = p_class_id;
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clasă invalidă', 'count', 0);
  END IF;

  v_teacher_id := auth.uid();
  IF NOT EXISTS (
    SELECT 1 FROM teacher_assignments
    WHERE teacher_id = v_teacher_id AND class_id = p_class_id AND subject_id = p_subject_id AND school_id = v_school_id
  ) AND NOT (has_role(v_teacher_id, 'director') OR has_role(v_teacher_id, 'secretariat')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nu ești asignat la această clasă/materie', 'count', 0);
  END IF;

  FOR v_student_id IN
    SELECT id FROM students WHERE class_id = p_class_id AND school_id = v_school_id AND (is_active IS NULL OR is_active = true)
  LOOP
    BEGIN
      v_res := add_grade(v_student_id, p_subject_id, p_value::numeric, 'oral', p_date, p_description);
      IF (v_res->>'success')::boolean THEN
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_count, 'error', v_err);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_grade_bulk TO authenticated;
COMMENT ON FUNCTION public.add_grade_bulk IS 'Add same grade to all active students in class for one subject/date.';
