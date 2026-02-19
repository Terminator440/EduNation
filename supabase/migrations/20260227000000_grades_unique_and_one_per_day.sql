-- =============================================================================
-- Migration: Unicitate grades + maxim o notă pe zi per materie/elev (cu excepții)
--
-- 1. Constrângere UNIQUE pe (student_id, subject_id, created_at)
-- 2. Coloană grade_type pentru a marca 'lucrare scrisă' / 'ascultare'
-- 3. Trigger: previne mai mult de o notă "normală" pe zi la aceeași materie
--    pentru același elev; permite mai multe dacă sunt 'lucrare scrisă' sau 'ascultare'
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: COLOANĂ grade_type ȘI CONSTRÂNGERE UNICITATE
-- =============================================================================

-- 1.1) Adaugă coloana grade_type (normal, lucrare_scrisa, ascultare)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grades' AND column_name = 'grade_type'
  ) THEN
    ALTER TABLE public.grades
      ADD COLUMN grade_type TEXT NOT NULL DEFAULT 'normal'
      CHECK (grade_type IN ('normal', 'lucrare_scrisa', 'ascultare'));
    COMMENT ON COLUMN public.grades.grade_type IS 'Tip notă: normal = o singură per zi; lucrare_scrisa/ascultare = pot fi mai multe pe zi.';
  END IF;
END $$;

-- 1.2) Constrângere de unicitate pe (student_id, subject_id, created_at)
-- Previne inserarea a două note cu același student, materie și moment de creare.
-- Rândurile cu deleted_at setat sunt excluse (nu participă la unicitate).
DROP INDEX IF EXISTS grades_student_subject_created_at_key;
CREATE UNIQUE INDEX grades_student_subject_created_at_key
  ON public.grades (student_id, subject_id, created_at)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- PART 2: TRIGGER - MAX O NOTĂ "NORMALĂ" PE ZI PER ELEV/MATERIE
-- =============================================================================

-- 2.1) Funcție: previne mai mult de o notă normală pe zi (același student, materie, dată)
CREATE OR REPLACE FUNCTION public.trg_grades_one_normal_per_day()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
  v_is_special BOOLEAN;  -- lucrare_scrisa sau ascultare
BEGIN
  -- Considerăm "special" dacă e lucrare scrisă sau ascultare (pot fi mai multe pe zi)
  -- Verificăm grade_type sau description (pentru compatibilitate cu date existente)
  v_is_special := COALESCE(NEW.grade_type, 'normal') IN ('lucrare_scrisa', 'ascultare')
    OR (NEW.description IS NOT NULL AND (
      trim(NEW.description) ILIKE '%lucrare scrisă%' OR
      trim(NEW.description) ILIKE '%lucrare scrisa%' OR
      trim(NEW.description) ILIKE '%ascultare%'
    ));

  IF v_is_special THEN
    -- Permite oricâte note pe zi pentru lucrări scrise / ascultări
    RETURN NEW;
  END IF;

  -- Notă "normală": verifică dacă există deja o notă normală în aceeași zi (excludem speciale)
  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.grades g
    WHERE g.student_id = NEW.student_id
      AND g.subject_id = NEW.subject_id
      AND g.date = NEW.date
      AND g.deleted_at IS NULL
      AND COALESCE(g.grade_type, 'normal') = 'normal'
      AND (g.description IS NULL OR (
        trim(g.description) NOT ILIKE '%lucrare scrisă%' AND
        trim(g.description) NOT ILIKE '%lucrare scrisa%' AND
        trim(g.description) NOT ILIKE '%ascultare%'
      ));

    IF v_count > 0 THEN
      RAISE EXCEPTION 'Există deja o notă pentru acest elev la această materie în data de %s. Pentru a adăuga mai multe note în aceeași zi, marcați nota ca "Lucrare scrisă" sau "Ascultare".', NEW.date
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- La UPDATE: dacă nu s-a schimbat nimic relevant, permitem
    IF OLD.date = NEW.date AND OLD.student_id = NEW.student_id AND OLD.subject_id = NEW.subject_id
       AND COALESCE(OLD.grade_type, 'normal') = COALESCE(NEW.grade_type, 'normal') THEN
      RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.grades g
    WHERE g.student_id = NEW.student_id
      AND g.subject_id = NEW.subject_id
      AND g.date = NEW.date
      AND g.deleted_at IS NULL
      AND g.id <> NEW.id
      AND COALESCE(g.grade_type, 'normal') = 'normal'
      AND (g.description IS NULL OR (
        trim(g.description) NOT ILIKE '%lucrare scrisă%' AND
        trim(g.description) NOT ILIKE '%lucrare scrisa%' AND
        trim(g.description) NOT ILIKE '%ascultare%'
      ));

    IF v_count > 0 THEN
      RAISE EXCEPTION 'Există deja o notă pentru acest elev la această materie în data de %s. Pentru a adăuga mai multe note în aceeași zi, marcați nota ca "Lucrare scrisă" sau "Ascultare".', NEW.date
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2.2) Atașare trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_grades_one_normal_per_day ON public.grades;
CREATE TRIGGER trg_grades_one_normal_per_day
  BEFORE INSERT OR UPDATE OF student_id, subject_id, date, grade_type
  ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_grades_one_normal_per_day();

COMMENT ON FUNCTION public.trg_grades_one_normal_per_day IS 'Permite maxim o notă "normală" per elev/materie/zi; notele tip lucrare scrisă sau ascultare pot fi mai multe pe zi.';

COMMIT;
