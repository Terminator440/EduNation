-- =============================================================================
-- Migration: Business Logic Automată (Single Source of Truth)
-- 
-- 1. subject_averages + trigger recalc la INSERT/UPDATE/DELETE pe grades
-- 2. check_semester_status() - blocare strictă (inclusiv profesori)
-- 3. Validare: profesor alocat în teacher_assignments + materie în class_subjects
-- 4. Notificări automate la notă nouă (parent)
-- 5. log_changes() audit granular cu OLD/NEW și mesaj lizibil
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: SUBJECT_AVERAGES TABLE + TRIGGER RECALC
-- =============================================================================

-- 1.1) Tabel subject_averages (student_id, subject_id, semester scope, average)
CREATE TABLE IF NOT EXISTS public.subject_averages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  average NUMERIC(4,2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year, semester)
);

COMMENT ON TABLE public.subject_averages IS 'Medii per elev, per materie, per semestru. Recalculate automat la INSERT/UPDATE/DELETE pe grades.';

CREATE INDEX IF NOT EXISTS idx_subject_averages_student_id ON public.subject_averages(student_id);
CREATE INDEX IF NOT EXISTS idx_subject_averages_subject_id ON public.subject_averages(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_averages_lookup ON public.subject_averages(student_id, subject_id, academic_year, semester);

ALTER TABLE public.subject_averages ENABLE ROW LEVEL SECURITY;

-- RLS: same visibility as grades (student, parent, teacher, staff)
DROP POLICY IF EXISTS "subject_averages_select" ON public.subject_averages;
CREATE POLICY "subject_averages_select" ON public.subject_averages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.students s WHERE s.id = subject_averages.student_id AND s.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parent_student_relations psr WHERE psr.student_id = subject_averages.student_id AND psr.parent_user_id = auth.uid())
  OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
  OR public.has_role(auth.uid(), 'director'::public.app_role)
  OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
  OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'developer'::public.app_role)
);

-- 1.2) Funcție recalc medie per (student, subject, academic_year, semester)
-- Consideră doar note cu deleted_at IS NULL. Medie aritmetică, rotunjită la 2 zecimale.
CREATE OR REPLACE FUNCTION public.recalc_subject_average(
  p_student_id UUID,
  p_subject_id UUID,
  p_academic_year INTEGER,
  p_semester INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg NUMERIC(4,2);
BEGIN
  SELECT ROUND(AVG(g.grade)::numeric, 2) INTO v_avg
  FROM public.grades g
  WHERE g.student_id = p_student_id
    AND g.subject_id = p_subject_id
    AND g.deleted_at IS NULL
    AND public.get_academic_year_from_date(g.date) = p_academic_year
    AND public.get_semester_from_date(g.date) = p_semester;

  IF v_avg IS NULL THEN
    DELETE FROM public.subject_averages
    WHERE student_id = p_student_id
      AND subject_id = p_subject_id
      AND academic_year = p_academic_year
      AND semester = p_semester;
    RETURN;
  END IF;

  INSERT INTO public.subject_averages (student_id, subject_id, academic_year, semester, average, updated_at)
  VALUES (p_student_id, p_subject_id, p_academic_year, p_semester, v_avg, now())
  ON CONFLICT (student_id, subject_id, academic_year, semester)
  DO UPDATE SET average = EXCLUDED.average, updated_at = now();
END;
$$;

-- 1.3) Trigger: la INSERT/UPDATE/DELETE pe grades, recalculează media
CREATE OR REPLACE FUNCTION public.trg_grades_recalc_average()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_subject_id UUID;
  v_date DATE;
  v_ay INTEGER;
  v_sem INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_student_id := OLD.student_id;
    v_subject_id := OLD.subject_id;
    v_date := OLD.date;
  ELSE
    v_student_id := NEW.student_id;
    v_subject_id := NEW.subject_id;
    v_date := NEW.date;
  END IF;

  v_ay := public.get_academic_year_from_date(v_date);
  v_sem := public.get_semester_from_date(v_date);

  PERFORM public.recalc_subject_average(v_student_id, v_subject_id, v_ay, v_sem);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_recalc_average ON public.grades;
CREATE TRIGGER trg_grades_recalc_average
  AFTER INSERT OR UPDATE OF grade, date, deleted_at OR DELETE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_grades_recalc_average();

-- Backfill subject_averages from existing grades
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT g.student_id, g.subject_id,
      public.get_academic_year_from_date(g.date) AS ay,
      public.get_semester_from_date(g.date) AS sem
    FROM public.grades g
    WHERE g.deleted_at IS NULL
  ) LOOP
    PERFORM public.recalc_subject_average(r.student_id, r.subject_id, r.ay, r.sem);
  END LOOP;
END $$;

-- =============================================================================
-- PART 2: CHECK_SEMESTER_STATUS() - BLOCARE PENTRU TOȚI
-- =============================================================================

-- 2.1) Funcție care aruncă excepție dacă semestrul e blocat (apelată din trigger)
CREATE OR REPLACE FUNCTION public.check_semester_status(
  p_table_name TEXT,
  p_date DATE,
  p_student_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_ay INTEGER;
  v_sem INTEGER;
  v_locked BOOLEAN;
BEGIN
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  v_ay := public.get_academic_year_from_date(p_date);
  v_sem := public.get_semester_from_date(p_date);

  SELECT sem.is_locked INTO v_locked
  FROM public.semesters sem
  WHERE sem.school_id = v_school_id
    AND sem.academic_year = v_ay
    AND sem.semester = v_sem;

  IF v_locked = true THEN
    RAISE EXCEPTION 'Semestrul pentru perioada acestei operații este blocat. Nu se pot modifica note sau absențe.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- 2.2) Trigger BEFORE pe grades: verifică blocare semestru
CREATE OR REPLACE FUNCTION public.trg_grades_check_semester_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.check_semester_status('grades', OLD.date, OLD.student_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.check_semester_status('grades', COALESCE(NEW.date, OLD.date), COALESCE(NEW.student_id, OLD.student_id));
    RETURN NEW;
  ELSE
    PERFORM public.check_semester_status('grades', NEW.date, NEW.student_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_check_semester_lock ON public.grades;
CREATE TRIGGER trg_grades_check_semester_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_grades_check_semester_lock();

-- 2.3) Trigger BEFORE pe attendance: verifică blocare semestru
CREATE OR REPLACE FUNCTION public.trg_attendance_check_semester_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.check_semester_status('attendance', OLD.date, OLD.student_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.check_semester_status('attendance', COALESCE(NEW.date, OLD.date), COALESCE(NEW.student_id, OLD.student_id));
    RETURN NEW;
  ELSE
    PERFORM public.check_semester_status('attendance', NEW.date, NEW.student_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_check_semester_lock ON public.attendance;
CREATE TRIGGER trg_attendance_check_semester_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_attendance_check_semester_lock();

-- =============================================================================
-- PART 3: VALIDARE PROFESOR + MATERIE ÎN PLANUL CLASEI
-- =============================================================================

-- 3.1) Trigger BEFORE INSERT/UPDATE pe grades: profesor alocat + materie în class_subjects
CREATE OR REPLACE FUNCTION public.trg_grades_validate_teacher_and_curriculum()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_id UUID;
  v_teacher_ok BOOLEAN;
  v_subject_in_plan BOOLEAN;
BEGIN
  SELECT s.class_id INTO v_class_id
  FROM public.students s
  WHERE s.id = COALESCE(NEW.student_id, OLD.student_id);

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Student invalid.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Materia trebuie să fie în planul de învățământ al clasei (class_subjects)
  SELECT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.class_id = v_class_id
      AND cs.subject_id = COALESCE(NEW.subject_id, OLD.subject_id)
  ) INTO v_subject_in_plan;

  IF NOT v_subject_in_plan THEN
    RAISE EXCEPTION 'Materia nu face parte din planul de învățământ al clasei elevului.'
      USING ERRCODE = 'P0001';
  END IF;

  -- La INSERT/UPDATE: profesorul trebuie să fie alocat (teacher_assignments sau class_subjects)
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.teacher_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      WHERE ta.teacher_id = NEW.teacher_id
        AND ta.class_id = v_class_id
        AND ta.subject_id = NEW.subject_id
    ) OR EXISTS (
      SELECT 1 FROM public.class_subjects cs
      WHERE cs.teacher_id = NEW.teacher_id
        AND cs.class_id = v_class_id
        AND cs.subject_id = NEW.subject_id
    ) INTO v_teacher_ok;

    IF NOT v_teacher_ok THEN
      RAISE EXCEPTION 'Nu sunteți alocat la această clasă/materie. Nu puteți introduce note.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_validate_teacher_and_curriculum ON public.grades;
CREATE TRIGGER trg_grades_validate_teacher_and_curriculum
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_grades_validate_teacher_and_curriculum();

-- =============================================================================
-- PART 4: NOTIFICĂRI AUTOMATE (NOTĂ NOUĂ -> PARENT)
-- =============================================================================

-- 4.1) Asigură coloana read_status pe notifications (alias pentru is_read)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_status BOOLEAN DEFAULT false;

UPDATE public.notifications
SET read_status = COALESCE(is_read, (read_at IS NOT NULL))
WHERE read_status IS NULL;

-- Sincronizare viitoare: trigger pe UPDATE pentru a păstra read_status = is_read
CREATE OR REPLACE FUNCTION public.notify_grade_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_user_id UUID;
  v_subject_name TEXT;
  v_message TEXT;
  v_title TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_subject_name
  FROM public.subjects WHERE id = NEW.subject_id;

  v_message := format('Ai primit nota %s la %s', NEW.grade, COALESCE(v_subject_name, 'materie'));
  IF NEW.description IS NOT NULL AND trim(NEW.description) != '' THEN
    v_message := v_message || format(' (%s)', NEW.description);
  END IF;
  v_title := 'Notă nouă';

  -- Notificare pentru elev (dacă are user_id)
  SELECT user_id INTO v_student_user_id FROM public.students WHERE id = NEW.student_id;
  IF v_student_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, is_read, read_status, link)
    VALUES (v_student_user_id, 'grade', v_title, v_message, false, false, '/grades');
  END IF;

  -- Notificări pentru părinți
  INSERT INTO public.notifications (user_id, type, title, message, is_read, read_status, link)
  SELECT
    psr.parent_user_id,
    'grade',
    format('Notă nouă pentru %s', COALESCE(s.full_name, 'elevul tău')),
    v_message,
    false,
    false,
    '/grades'
  FROM public.parent_student_relations psr
  JOIN public.students s ON s.id = psr.student_id
  WHERE psr.student_id = NEW.student_id AND psr.parent_user_id IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_grade_added ON public.grades;
CREATE TRIGGER trg_notify_grade_added
  AFTER INSERT ON public.grades
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_grade_added();

-- =============================================================================
-- PART 5: AUDIT GRANULAR - log_changes() CU OLD/NEW ȘI MESAJE LIZIBILE
-- =============================================================================

-- 5.1) Helper: construiește mesaj lizibil pentru schimbări pe grades (parametri expliciti pentru a evita NULL RECORD)
CREATE OR REPLACE FUNCTION public.audit_summary_grades(
  p_op TEXT,
  p_user_name TEXT,
  p_old_grade NUMERIC DEFAULT NULL,
  p_new_grade NUMERIC DEFAULT NULL,
  p_old_date DATE DEFAULT NULL,
  p_new_date DATE DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_msg TEXT;
BEGIN
  IF p_op = 'INSERT' THEN
    v_msg := format('%s a adăugat nota %s la data %s', p_user_name, p_new_grade, p_new_date);
  ELSIF p_op = 'UPDATE' THEN
    IF (p_old_grade IS DISTINCT FROM p_new_grade) THEN
      v_msg := format('%s a schimbat nota de la %s la %s la data %s', p_user_name, p_old_grade, p_new_grade, COALESCE(p_new_date::text, p_old_date::text));
    ELSE
      v_msg := format('%s a actualizat înregistrarea de notă (id: %s)', p_user_name, p_entity_id);
    END IF;
  ELSIF p_op = 'DELETE' THEN
    v_msg := format('%s a șters nota %s de la data %s', p_user_name, p_old_grade, p_old_date);
  ELSE
    v_msg := format('%s - %s pe grades', p_user_name, p_op);
  END IF;
  RETURN v_msg;
END;
$$;

-- 5.2) Funcție generică jsonb_diff (chei diferite între OLD și NEW)
CREATE OR REPLACE FUNCTION public.jsonb_diff(old_val JSONB, new_val JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_key TEXT;
BEGIN
  FOR v_key IN
    SELECT DISTINCT k.key
    FROM (
      SELECT key FROM jsonb_each(COALESCE(old_val, '{}'::jsonb))
      UNION
      SELECT key FROM jsonb_each(COALESCE(new_val, '{}'::jsonb))
    ) AS k(key)
    WHERE (COALESCE(old_val, '{}'::jsonb)->k.key) IS DISTINCT FROM (COALESCE(new_val, '{}'::jsonb)->k.key)
  LOOP
    v_result := v_result || jsonb_build_object(v_key, jsonb_build_object('old', old_val->v_key, 'new', new_val->v_key));
  END LOOP;
  RETURN v_result;
END;
$$;

-- 5.3) log_changes() - salvează în audit_logs cu old_data, new_data și summary
CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_uname TEXT;
  v_urole public.app_role;
  v_school_id UUID;
  v_entity_id UUID;
  v_old_json JSONB;
  v_new_json JSONB;
  v_summary TEXT;
  v_details JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'student'::public.app_role), p.school_id
  INTO v_uname, v_urole, v_school_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  v_entity_id := COALESCE((NEW).id, (OLD).id);
  v_old_json := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new_json := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  IF TG_TABLE_NAME = 'grades' THEN
    v_summary := public.audit_summary_grades(
      TG_OP, COALESCE(v_uname, 'Utilizator'),
      (OLD).grade, (NEW).grade,
      (OLD).date, (NEW).date,
      v_entity_id
    );
  ELSE
    v_summary := format('%s - %s pe %s (id: %s)', COALESCE(v_uname, 'Utilizator'), TG_OP, TG_TABLE_NAME, v_entity_id);
  END IF;

  v_details := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'server_ts', now(),
    'summary', v_summary,
    'diff', public.jsonb_diff(v_old_json, v_new_json)
  );

  INSERT INTO public.audit_logs (
    user_id, user_name, active_role, action, entity_type, entity_id,
    old_data, new_data, details, school_id
  ) VALUES (
    v_uid, COALESCE(v_uname, ''), COALESCE(v_urole, 'student'::public.app_role),
    TG_OP, TG_TABLE_NAME, v_entity_id,
    v_old_json, v_new_json, v_details, v_school_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5.4) Înlocuie trigger-urile de audit pe grades cu log_changes (un singur audit granular)
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
DROP TRIGGER IF EXISTS trg_audit_row_change_grades ON public.grades;
DROP TRIGGER IF EXISTS trg_audit_grades_update_details ON public.grades;
CREATE TRIGGER trg_audit_grades_log_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.log_changes();

-- Audit granular și pe attendance (mesaj generic; old_data/new_data în details)
DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance_log_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.log_changes();

-- Opțional: audit și pe user_roles (schimbări roluri) cu același log_changes
-- Dacă există trigger pe user_roles, îl putem adapta; altfel omitem.

COMMENT ON FUNCTION public.log_changes IS 'Audit granular: salvează old_data, new_data și mesaj lizibil (ex: Profesorul X a schimbat nota de la 7 la 9 la data Y).';
COMMENT ON FUNCTION public.check_semester_status IS 'Aruncă excepție dacă semestrul este blocat. Apelat din trigger-uri pe grades și attendance - blochează toți utilizatorii.';
COMMENT ON FUNCTION public.recalc_subject_average IS 'Recalculează media elevului la o materie pentru un semestru; folosit de trigger la modificări grades.';

COMMIT;
