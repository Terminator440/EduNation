-- =============================================================================
-- Migration: final_grades la blocare semestru + modificare doar de administrator
--
-- 1. Tabelul final_grades există deja; îl păstrăm și asigurăm coloanele necesare.
-- 2. Funcție PL/pgSQL care calculează media aritmetică a notelor din semestru,
--    o rotunjește și o salvează în final_grades (apelată la blocare).
-- 3. Trigger pe semesters: când is_locked devine true, rulează calculul și salvează.
-- 4. RLS: UPDATE/DELETE pe final_grades doar pentru administratori.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: ASIGURARE TABEL final_grades
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.final_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  final_grade INTEGER NOT NULL CHECK (final_grade >= 1 AND final_grade <= 10),
  calculated_average NUMERIC(4,2) NOT NULL,
  grade_count INTEGER NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year, semester)
);

-- Coloane opționale dacă tabelul a fost creat fără ele (migrații vechi)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'final_grades' AND column_name = 'calculated_at') THEN
    ALTER TABLE public.final_grades ADD COLUMN calculated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'final_grades' AND column_name = 'calculated_by') THEN
    ALTER TABLE public.final_grades ADD COLUMN calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_final_grades_student ON public.final_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_subject ON public.final_grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_school_year_semester ON public.final_grades(school_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_final_grades_student_subject_year_semester ON public.final_grades(student_id, subject_id, academic_year, semester);

COMMENT ON TABLE public.final_grades IS 'Note finale per elev, materie și semestru. Calculate automat la blocare (is_locked=true). Modificabile doar de administrator.';

-- =============================================================================
-- PART 2: FUNCȚIE - CALCUL ȘI SALVARE NOTE FINALE PENTRU UN SEMESTRU
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_and_save_final_grades_for_semester(
  p_school_id UUID,
  p_academic_year INTEGER,
  p_semester INTEGER,
  p_calculated_by UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_student_id UUID;
  v_subject_id UUID;
  v_avg NUMERIC(4,2);
  v_grade_count INTEGER;
  v_final INTEGER;
  v_uid UUID;
BEGIN
  v_uid := COALESCE(p_calculated_by, auth.uid());

  -- Pentru fiecare pereche (student, subject) care are note în acel semestru
  FOR v_student_id, v_subject_id IN
    SELECT g.student_id, g.subject_id
    FROM public.grades g
    WHERE g.school_id = p_school_id
      AND g.deleted_at IS NULL
      AND public.get_academic_year_from_date(g.date) = p_academic_year
      AND public.get_semester_from_date(g.date) = p_semester
    GROUP BY g.student_id, g.subject_id
  LOOP
    SELECT
      ROUND(AVG(g.grade::NUMERIC), 2)::NUMERIC(4,2),
      COUNT(*)::INTEGER
    INTO v_avg, v_grade_count
    FROM public.grades g
    WHERE g.student_id = v_student_id
      AND g.subject_id = v_subject_id
      AND g.deleted_at IS NULL
      AND public.get_academic_year_from_date(g.date) = p_academic_year
      AND public.get_semester_from_date(g.date) = p_semester;

    IF v_grade_count > 0 AND v_avg IS NOT NULL THEN
      v_final := ROUND(v_avg)::INTEGER;
      v_final := GREATEST(1, LEAST(10, v_final));

      INSERT INTO public.final_grades (
        student_id,
        subject_id,
        school_id,
        academic_year,
        semester,
        final_grade,
        calculated_average,
        grade_count,
        calculated_at,
        calculated_by
      )
      VALUES (
        v_student_id,
        v_subject_id,
        p_school_id,
        p_academic_year,
        p_semester,
        v_final,
        v_avg,
        v_grade_count,
        now(),
        v_uid
      )
      ON CONFLICT (student_id, subject_id, academic_year, semester) DO UPDATE SET
        final_grade = EXCLUDED.final_grade,
        calculated_average = EXCLUDED.calculated_average,
        grade_count = EXCLUDED.grade_count,
        calculated_at = now(),
        calculated_by = EXCLUDED.calculated_by,
        updated_at = now();

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.compute_and_save_final_grades_for_semester IS 'Calculează media aritmetică a notelor din semestru, rotunjește și salvează în final_grades. Apelată la blocare semestru (is_locked=true) sau din RPC.';

-- =============================================================================
-- PART 3: TRIGGER PE semesters - LA is_locked = true SALVEAZĂ NOTELE FINALE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_semester_locked_compute_final_grades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Doar când semestrul devine blocat (trece din false în true)
  IF (OLD.is_locked IS NOT DISTINCT FROM false) AND (NEW.is_locked = true) THEN
    v_count := public.compute_and_save_final_grades_for_semester(
      NEW.school_id,
      NEW.academic_year,
      NEW.semester,
      NEW.locked_by
    );
    -- Opțional: log
    INSERT INTO public.audit_logs (
      user_id, user_name, active_role, action, entity_type, entity_id,
      details, school_id
    )
    SELECT
      NEW.locked_by,
      COALESCE(p.full_name, ''),
      COALESCE(p.active_role, 'director'::public.app_role),
      'semester_locked_final_grades',
      'semester',
      NEW.id,
      jsonb_build_object(
        'school_id', NEW.school_id,
        'academic_year', NEW.academic_year,
        'semester', NEW.semester,
        'final_grades_created', v_count
      ),
      NEW.school_id
    FROM public.profiles p
    WHERE p.id = NEW.locked_by
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_semester_locked_compute_final_grades ON public.semesters;
CREATE TRIGGER trg_semester_locked_compute_final_grades
  AFTER UPDATE OF is_locked ON public.semesters
  FOR EACH ROW
  WHEN (OLD.is_locked IS DISTINCT FROM NEW.is_locked AND NEW.is_locked = true)
  EXECUTE FUNCTION public.trg_semester_locked_compute_final_grades();

COMMENT ON FUNCTION public.trg_semester_locked_compute_final_grades IS 'La blocare semestru (is_locked=true), calculează și salvează notele finale în final_grades.';

-- =============================================================================
-- PART 4: RLS - MODIFICARE (UPDATE/DELETE) DOAR PENTRU ADMINISTRATOR
-- =============================================================================

-- Șterge politicile vechi de INSERT/UPDATE dacă există, ca să le înlocuim clar
DROP POLICY IF EXISTS "Staff can insert final grades" ON public.final_grades;
DROP POLICY IF EXISTS "Admin can update final grades" ON public.final_grades;
DROP POLICY IF EXISTS "Admin can delete final grades" ON public.final_grades;

-- INSERT: director/secretariat (la închidere semestru) sau administrator
CREATE POLICY "Staff or admin can insert final grades" ON public.final_grades
  FOR INSERT
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::public.app_role) OR
        public.has_role(auth.uid(), 'secretariat'::public.app_role)
      )
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- UPDATE: doar administratori (director pentru școala lor, uat_admin, developer)
CREATE POLICY "Admin can update final grades" ON public.final_grades
  FOR UPDATE
  USING (
    (
      school_id = public.get_user_school_id() AND
      public.has_role(auth.uid(), 'director'::public.app_role)
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      public.has_role(auth.uid(), 'director'::public.app_role)
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- DELETE: doar administratori (același criteriu)
CREATE POLICY "Admin can delete final grades" ON public.final_grades
  FOR DELETE
  USING (
    (
      school_id = public.get_user_school_id() AND
      public.has_role(auth.uid(), 'director'::public.app_role)
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Asigură că RLS e activ
ALTER TABLE public.final_grades ENABLE ROW LEVEL SECURITY;

-- Politici SELECT (dacă nu există deja, nu le ștergem; pot exista din migrarea anterioară)
-- Nu recreez toate SELECT-urile aici pentru a nu intra în conflict cu 20260221000009.

GRANT EXECUTE ON FUNCTION public.compute_and_save_final_grades_for_semester TO authenticated;

COMMIT;
