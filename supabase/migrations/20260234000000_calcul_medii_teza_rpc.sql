-- =============================================================================
-- Calcul medii în DB: pondere teză (25%), rotunjire parțială (2 zecimale),
-- rotunjire finală (întreg, .5 rotunjit în sus). Mută logica din frontend în RPC.
-- =============================================================================

BEGIN;

-- Rotunjire finală notă (1-10): regula românească – .5 rotunjeste în sus
CREATE OR REPLACE FUNCTION public.round_final_grade_ro(p_average NUMERIC)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_floor INTEGER;
  v_frac NUMERIC;
BEGIN
  IF p_average IS NULL THEN RETURN 1; END IF;
  v_floor := FLOOR(p_average)::INTEGER;
  v_frac := p_average - v_floor;
  IF v_frac >= 0.5 THEN
    RETURN LEAST(10, v_floor + 1);
  END IF;
  RETURN GREATEST(1, ROUND(p_average)::INTEGER);
END;
$$;

COMMENT ON FUNCTION public.round_final_grade_ro IS 'Rotunjire notă finală 1-10: .5 rotunjeste în sus.';

-- RPC: medie semestrială cu teză (pondere 25%) și rotunjiri
-- Teza = nota cu grade_type = lucrare_scrisa (una per semestru/subject, ex. ultima)
CREATE OR REPLACE FUNCTION public.calculate_semester_average_with_teza(
  p_student_id UUID,
  p_subject_id UUID,
  p_semester INTEGER,
  p_academic_year INTEGER DEFAULT NULL,
  p_teza_weight NUMERIC DEFAULT 0.25
)
RETURNS TABLE (
  partial_average NUMERIC(4,2),
  teza_grade NUMERIC(4,2),
  weighted_average NUMERIC(4,2),
  final_grade_rounded INTEGER,
  grade_count BIGINT,
  normal_count BIGINT,
  has_teza BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
  v_partial NUMERIC;
  v_teza NUMERIC;
  v_weighted NUMERIC;
  v_normal_count BIGINT;
  v_teza_count BIGINT;
BEGIN
  IF p_teza_weight IS NULL OR p_teza_weight < 0 OR p_teza_weight > 1 THEN
    p_teza_weight := 0.25;
  END IF;

  IF p_academic_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN v_year := v_year - 1; END IF;
  ELSE
    v_year := p_academic_year;
  END IF;

  -- Medie note normale (fără teză): normal + ascultare
  SELECT
    ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2),
    COUNT(*)::BIGINT
  INTO v_partial, v_normal_count
  FROM public.grades g
  WHERE g.student_id = p_student_id
    AND g.subject_id = p_subject_id
    AND g.deleted_at IS NULL
    AND public.get_semester_from_date(g.date) = p_semester
    AND (CASE WHEN EXTRACT(MONTH FROM g.date) IN (9,10,11,12) THEN EXTRACT(YEAR FROM g.date)
              ELSE EXTRACT(YEAR FROM g.date) - 1 END) = v_year
    AND COALESCE(g.grade_type, 'normal') IN ('normal', 'ascultare');

  -- Teza: o singură notă lucrare_scrisa (luăm ultima după dată)
  SELECT g.grade::NUMERIC
  INTO v_teza
  FROM public.grades g
  WHERE g.student_id = p_student_id
    AND g.subject_id = p_subject_id
    AND g.deleted_at IS NULL
    AND COALESCE(g.grade_type, 'normal') = 'lucrare_scrisa'
    AND public.get_semester_from_date(g.date) = p_semester
    AND (CASE WHEN EXTRACT(MONTH FROM g.date) IN (9,10,11,12) THEN EXTRACT(YEAR FROM g.date)
              ELSE EXTRACT(YEAR FROM g.date) - 1 END) = v_year
  ORDER BY g.date DESC
  LIMIT 1;

  v_partial := COALESCE(v_partial, 0);
  v_normal_count := COALESCE(v_normal_count, 0);

  IF v_teza IS NOT NULL THEN
    v_weighted := ROUND((v_partial * (1 - p_teza_weight) + v_teza * p_teza_weight)::NUMERIC, 2)::NUMERIC(4,2);
  ELSE
    v_weighted := v_partial;
  END IF;

  RETURN QUERY SELECT
    v_partial,
    v_teza,
    v_weighted,
    public.round_final_grade_ro(v_weighted),
    v_normal_count + (CASE WHEN v_teza IS NOT NULL THEN 1 ELSE 0 END),
    v_normal_count,
    (v_teza IS NOT NULL);
END;
$$;

COMMENT ON FUNCTION public.calculate_semester_average_with_teza IS 'Calculează media semestrială cu pondere teză (implicit 25%). Rotunjire parțială 2 zecimale, finală întreg (.5 în sus).';

GRANT EXECUTE ON FUNCTION public.round_final_grade_ro TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_semester_average_with_teza TO authenticated;

COMMIT;
