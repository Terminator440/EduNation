-- Real promotion logic: parse class name (e.g. 9A -> 10A), create next class if missing, move students.
-- Final grade (12): do not promote (graduated).

CREATE OR REPLACE FUNCTION public.school_years_promote_students(p_school_year_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_promoted int := 0;
  v_class record;
  v_grade int;
  v_suffix text;
  v_next_name text;
  v_next_id uuid;
  v_student_count int;
  v_final_grade constant int := 12;
BEGIN
  SELECT sy.school_id INTO v_school_id
  FROM public.school_years sy
  WHERE sy.id = p_school_year_id;
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School year not found');
  END IF;
  IF NOT (public.get_user_school_id() = v_school_id OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed');
  END IF;

  FOR v_class IN
    SELECT c.id, c.name
    FROM public.classes c
    WHERE c.school_id = v_school_id
  LOOP
    -- Parse class name: digits + optional suffix (e.g. 9A -> 9, A; 10B -> 10, B; 10 -> 10, '')
    v_grade := NULL;
    v_suffix := '';
    IF v_class.name ~ '^([0-9]+)(.*)$' THEN
      v_grade := (regexp_match(v_class.name, '^([0-9]+)(.*)$'))[1]::int;
      v_suffix := COALESCE((regexp_match(v_class.name, '^([0-9]+)(.*)$'))[2], '');
    END IF;

    IF v_grade IS NULL OR v_grade >= v_final_grade THEN
      -- Skip: cannot parse or final grade (e.g. 12) -> graduated, do not promote
      CONTINUE;
    END IF;

    v_next_name := (v_grade + 1)::text || v_suffix;

    -- Find or create next class
    SELECT id INTO v_next_id FROM public.classes
    WHERE school_id = v_school_id AND name = v_next_name
    LIMIT 1;
    IF v_next_id IS NULL THEN
      INSERT INTO public.classes (school_id, name, year, section)
      VALUES (v_school_id, v_next_name, v_grade + 1, COALESCE(NULLIF(trim(v_suffix), ''), ''))
      RETURNING id INTO v_next_id;
    END IF;

    -- Move students to next class
    WITH updated AS (
      UPDATE public.students
      SET class_id = v_next_id
      WHERE class_id = v_class.id
      RETURNING id
    )
    SELECT COUNT(*)::int INTO v_student_count FROM updated;
    v_promoted := v_promoted + v_student_count;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'promoted_count', v_promoted);
END;
$$;

COMMENT ON FUNCTION public.school_years_promote_students IS 'Promote students: 9A->10A, create next class if missing; skip final grade (12).';
