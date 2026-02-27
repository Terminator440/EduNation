-- =============================================================================
-- SaaS Hardening & Compliance
-- - Audit: note/absențe nu se șterg fizic (doar soft delete); trigger înregistrează cine, când, valoare veche/nouă
-- - Semester lock: eroare în DB la orice modificare notă când semestrul e blocat
-- - Absențe: doar dirigintele poate seta statusul "motivată"
-- - Notificări: alertă când media < 5 sau absențe peste prag
-- - GDPR: consent_accepted_at, export date elev
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. SEMESTER LOCK – eroare în DB la INSERT/UPDATE note (nu doar RLS)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_semester_not_locked_for_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_semester_locked_for_grade(COALESCE(NEW.date, CURRENT_DATE), NEW.student_id) THEN
    RAISE EXCEPTION 'Semestrul este blocat. Nu se pot modifica notele.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_semester_locked ON public.grades;
CREATE TRIGGER trg_grades_semester_locked
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.check_semester_not_locked_for_grade();

COMMENT ON FUNCTION public.check_semester_not_locked_for_grade IS 'Raises exception if semester is locked; prevents any grade modification at DB level.';

-- =============================================================================
-- 2. ABSENȚE – statusuri nemotivată / motivată / în curs; doar dirigintele poate seta motivată
-- =============================================================================

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending', 'nemotivata', 'motivata', 'in_curs'));

-- Doar dirigintele poate seta statusul "motivată" – enforce prin trigger
CREATE OR REPLACE FUNCTION public.is_homeroom_teacher_for_student(p_teacher_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.students s ON s.class_id = c.id
    WHERE s.id = p_student_id AND c.teacher_id = p_teacher_id
  );
$$;

CREATE OR REPLACE FUNCTION public.check_only_homeroom_can_excuse()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('motivat', 'motivated', 'motivata') AND (OLD.status IS NULL OR OLD.status NOT IN ('motivat', 'motivated', 'motivata')) THEN
    IF NOT (
      public.has_role((select auth.uid()), 'director'::public.app_role)
      OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
      OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'developer'::public.app_role)
      OR public.is_homeroom_teacher_for_student((select auth.uid()), NEW.student_id)
    ) THEN
      RAISE EXCEPTION 'Doar dirigintele poate motiva absențele.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_only_homeroom_excuse ON public.attendance;
CREATE TRIGGER trg_attendance_only_homeroom_excuse
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.check_only_homeroom_can_excuse();

-- =============================================================================
-- 3. NOTIFICĂRI – alertă când media < 5 sau absențe peste prag
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_low_average_or_high_absences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_user_id UUID;
  v_subject_name TEXT;
  v_avg NUMERIC;
  v_abs_count BIGINT;
  v_threshold_absences INTEGER := 20;
  v_message TEXT;
BEGIN
  IF TG_TABLE_NAME = 'grades' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO v_student_user_id FROM public.students WHERE id = NEW.student_id;
    SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
    SELECT ROUND(AVG(grade)::NUMERIC, 2) INTO v_avg
    FROM public.grades
    WHERE student_id = NEW.student_id AND subject_id = NEW.subject_id AND deleted_at IS NULL;
    IF v_avg IS NOT NULL AND v_avg < 5 AND v_student_user_id IS NOT NULL THEN
      v_message := format('Media la %s este sub 5 (%.2f).', COALESCE(v_subject_name, 'materie'), v_avg);
      INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
      VALUES (v_student_user_id, 'alert', 'Medie sub 5', v_message, false, '/grades');
      INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
      SELECT psr.parent_user_id, 'alert', 'Medie sub 5', v_message, false, '/grades'
      FROM public.parent_student_relations psr
      WHERE psr.student_id = NEW.student_id AND psr.parent_user_id IS NOT NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'attendance' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO v_student_user_id FROM public.students WHERE id = NEW.student_id;
    SELECT COUNT(*) INTO v_abs_count
    FROM public.attendance
    WHERE student_id = NEW.student_id AND deleted_at IS NULL
      AND status IN ('absent', 'unexcused', 'nemotivata', 'motivat', 'motivated', 'motivata');
    IF v_abs_count >= v_threshold_absences AND v_student_user_id IS NOT NULL THEN
      v_message := format('Numărul de absențe a depășit pragul permis (%s).', v_threshold_absences);
      INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
      VALUES (v_student_user_id, 'alert', 'Alerte absențe', v_message, false, '/attendance');
      INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
      SELECT psr.parent_user_id, 'alert', 'Alerte absențe', v_message, false, '/attendance'
      FROM public.parent_student_relations psr
      WHERE psr.student_id = NEW.student_id AND psr.parent_user_id IS NOT NULL;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'grades' THEN RETURN NEW; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_low_avg_high_abs ON public.grades;
CREATE TRIGGER trg_notify_low_avg_high_abs
  AFTER INSERT ON public.grades
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_low_average_or_high_absences();

DROP TRIGGER IF EXISTS trg_notify_low_avg_high_abs_att ON public.attendance;
CREATE TRIGGER trg_notify_low_avg_high_abs_att
  AFTER INSERT ON public.attendance
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_low_average_or_high_absences();

-- =============================================================================
-- 4. GDPR – consent_accepted_at și export date elev
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.consent_accepted_at IS 'GDPR: momentul acceptării consimțământului pentru prelucrarea datelor.';
COMMENT ON COLUMN public.students.consent_accepted_at IS 'GDPR: momentul acceptării consimțământului (elev/părinte).';

CREATE OR REPLACE FUNCTION public.export_student_data(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_user_school UUID;
  v_result JSONB;
BEGIN
  v_user_school := public.get_user_school_id();
  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL OR v_school_id != v_user_school THEN
    IF NOT (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role)) THEN
      RAISE EXCEPTION 'Acces interzis la datele acestui elev.';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'student_id', p_student_id,
    'exported_at', now(),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p JOIN public.students s ON s.user_id = p.id WHERE s.id = p_student_id LIMIT 1),
    'student', (SELECT to_jsonb(s) FROM public.students s WHERE s.id = p_student_id),
    'grades', (SELECT jsonb_agg(to_jsonb(g)) FROM public.grades g WHERE g.student_id = p_student_id AND g.deleted_at IS NULL),
    'attendance', (SELECT jsonb_agg(to_jsonb(a)) FROM public.attendance a WHERE a.student_id = p_student_id AND a.deleted_at IS NULL)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.export_student_data IS 'GDPR: export date elev (JSON). Doar director/admin sau școala elevului.';
GRANT EXECUTE ON FUNCTION public.export_student_data TO authenticated;

COMMIT;
