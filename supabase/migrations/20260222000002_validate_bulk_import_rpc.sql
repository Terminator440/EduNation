-- RPC: validate_bulk_import_rows
-- Validates rows for bulk import: resolves class for students, checks duplicate email in school.
-- Caller must pass school_id (from session). Returns per-row errors and resolved class_id.

CREATE OR REPLACE FUNCTION public.validate_bulk_import_rows(
  p_rows jsonb,
  p_school_id uuid
)
RETURNS TABLE(
  row_index integer,
  errors text[],
  class_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  idx integer := 0;
  v_errors text[];
  v_class_id uuid;
  v_email text;
  v_class_identifier text;
  v_role text;
  v_year integer;
  v_section text;
  v_match text[];
BEGIN
  IF p_school_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    idx := (r->>'rowIndex')::integer;
    v_errors := ARRAY[]::text[];
    v_class_id := NULL;
    v_email := NULLIF(trim(r->>'email'), '');
    v_class_identifier := NULLIF(trim(r->>'class_identifier'), '');
    v_role := NULLIF(trim(r->>'role'), '');

    -- Duplicate email in this school
    IF v_email IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE school_id = p_school_id AND LOWER(email) = LOWER(v_email)
      ) THEN
        v_errors := array_append(v_errors, 'Email deja existent în școală');
      END IF;
    END IF;

    -- For students: resolve class_identifier -> class_id
    IF v_role = 'student' AND v_class_identifier IS NOT NULL THEN
      -- Try as UUID first
      BEGIN
        v_class_id := v_class_identifier::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = v_class_id AND school_id = p_school_id) THEN
          v_class_id := NULL;
          v_errors := array_append(v_errors, 'Clasă inexistentă sau nu aparține școlii');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_class_id := NULL;
        -- Pattern like "10A" or "10 A" -> year=10, section=A
        v_match := regexp_match(v_class_identifier, '^(\d{1,2})\s*([A-Za-z])$');
        IF v_match IS NOT NULL THEN
          v_year := v_match[1]::integer;
          v_section := upper(v_match[2]);
          SELECT c.id INTO v_class_id
          FROM public.classes c
          WHERE c.school_id = p_school_id AND c.year = v_year AND c.section = v_section
          LIMIT 1;
        END IF;
        IF v_class_id IS NULL THEN
          -- Try by name (e.g. "Clasa a 10-a")
          SELECT c.id INTO v_class_id
          FROM public.classes c
          WHERE c.school_id = p_school_id
            AND (c.name ILIKE '%' || v_class_identifier || '%'
                 OR (c.year::text || c.section) = regexp_replace(v_class_identifier, '\s+', '', 'g'))
          LIMIT 1;
        END IF;
        IF v_class_id IS NULL THEN
          v_errors := array_append(v_errors, 'Clasă inexistentă: ' || v_class_identifier);
        END IF;
      END;
    ELSIF v_role = 'student' AND (v_class_identifier IS NULL OR v_class_identifier = '') THEN
      v_errors := array_append(v_errors, 'Clasa este obligatorie pentru elevi');
    END IF;

    row_index := idx;
    errors := v_errors;
    class_id := v_class_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.validate_bulk_import_rows(jsonb, uuid) IS
  'Validates bulk import rows: duplicate email in school, resolves class_identifier to class_id for students. Used before calling bulk-import Edge function.';
