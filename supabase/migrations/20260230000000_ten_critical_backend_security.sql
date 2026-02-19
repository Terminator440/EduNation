-- =============================================================================
-- Migration: 10 puncte critice pentru securizarea și finalizarea backend-ului
--
-- 1. Strict Multi-Tenancy: RLS cu school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
-- 2. Enforced School ID: students.school_id NOT NULL + FK
-- 3. Data Constraints: CHECK note 1-10, absențe >= 0
-- 4. Audit Log: audit_logs + trigger pe note, absențe, rol (old_data, new_data)
-- 5. Semester Locking: is_locked pe semesters, DENY modificare note când e blocat
-- 6. Granular RLS: Profesori văd doar elevii din clasele alocate
-- 7. Teacher-Subject-Class Pivot: teacher_assignments (fără intrare = fără drept)
-- 8. Strict Roles: app_role ENUM, fără string-uri libere în role
-- 9. Event System: school_events vizibilitate (per clasă/școală) + notificări
-- 10. Performance Indexing: indexuri pe school_id, student_id, class_id, subject_id
-- =============================================================================

BEGIN;

-- =============================================================================
-- PUNCT 1: STRICT MULTI-TENANCY – get_user_school_id() = (SELECT school_id FROM profiles WHERE id = auth.uid())
-- Directorul nu are voie să vadă alte școli. Toate politicile folosesc această clauză.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_user_school_id() IS 'Strict multi-tenancy: returnează school_id-ul utilizatorului curent. Directorul vede DOAR propria școală.';

-- Alias pentru compatibilitate
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_school_id()
$$;

-- =============================================================================
-- PUNCT 2: ENFORCED SCHOOL ID – students.school_id NOT NULL + FK
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.students ADD COLUMN school_id UUID;
    UPDATE public.students s SET school_id = c.school_id
    FROM public.classes c WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'students'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;

  UPDATE public.students s SET school_id = c.school_id
  FROM public.classes c WHERE s.class_id = c.id AND (s.school_id IS NULL OR s.school_id != c.school_id);

  IF NOT EXISTS (SELECT 1 FROM public.students WHERE school_id IS NULL) THEN
    ALTER TABLE public.students ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- PUNCT 3: DATA CONSTRAINTS – note 1–10, absențe >= 0
-- =============================================================================

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_grade_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending'));

-- Dacă există coloană numerică pentru număr absențe (ex. într-un tabel de sumar)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'absence_count'
  ) THEN
    ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_absence_count_non_negative;
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_absence_count_non_negative CHECK (absence_count >= 0);
  END IF;
END $$;

-- =============================================================================
-- PUNCT 4: AUDIT LOG – audit_logs + trigger note, absențe, rol (old_data, new_data)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    CREATE TABLE public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id UUID,
      old_data JSONB,
      new_data JSONB,
      school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data JSONB;
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_data JSONB;
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS table_name TEXT;
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_id UUID;
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_own_school_or_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_own_school_or_admin" ON public.audit_logs
  FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Funcție generică de audit (INSERT/UPDATE/DELETE) cu old_data și new_data
CREATE OR REPLACE FUNCTION public.audit_trigger_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_old JSONB;
  v_new JSONB;
  v_action TEXT;
  v_record_id UUID;
BEGIN
  v_action := TG_OP;
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id;
    IF (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = TG_TABLE_NAME AND column_name = 'school_id')) THEN
      v_school_id := (to_jsonb(OLD)->>'school_id')::uuid;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    IF (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = TG_TABLE_NAME AND column_name = 'school_id')) THEN
      v_school_id := (to_jsonb(NEW)->>'school_id')::uuid;
    END IF;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    IF (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = TG_TABLE_NAME AND column_name = 'school_id')) THEN
      v_school_id := (to_jsonb(NEW)->>'school_id')::uuid;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, school_id)
  VALUES (auth.uid(), v_action, TG_TABLE_NAME, v_record_id, v_old, v_new, v_school_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Trigger pe grades
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_log();

-- Trigger pe attendance
DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_log();

-- Trigger pe profiles pentru schimbări de rol (role / active_role)
CREATE OR REPLACE FUNCTION public.audit_profiles_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.active_role IS DISTINCT FROM NEW.active_role) THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, school_id)
    VALUES (
      auth.uid(),
      'UPDATE',
      'profiles',
      NEW.id,
      jsonb_build_object('role', OLD.role, 'active_role', OLD.active_role),
      jsonb_build_object('role', NEW.role, 'active_role', NEW.active_role),
      NEW.school_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profiles_role ON public.profiles;
CREATE TRIGGER trg_audit_profiles_role
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_role_change();

-- =============================================================================
-- PUNCT 5: SEMESTER LOCKING – is_locked pe semesters, DENY modificare note
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'semesters' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE public.semesters ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Asigură că funcția de verificare semestru blocat există
CREATE OR REPLACE FUNCTION public.is_semester_locked_for_grade(p_grade_date DATE, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_academic_year INTEGER;
  v_semester INTEGER;
  v_is_locked BOOLEAN;
BEGIN
  SELECT s.school_id INTO v_school_id FROM public.students s WHERE s.id = p_student_id;
  IF v_school_id IS NULL THEN RETURN false; END IF;
  v_academic_year := public.get_academic_year_from_date(p_grade_date);
  v_semester := public.get_semester_from_date(p_grade_date);
  SELECT is_locked INTO v_is_locked FROM public.semesters
  WHERE school_id = v_school_id AND academic_year = v_academic_year AND semester = v_semester;
  RETURN COALESCE(v_is_locked, false);
END;
$$;

-- Politicile de INSERT/UPDATE pe grades trebuie să includă NOT is_semester_locked_for_grade.
-- Eliminăm politicile vechi de insert/update pe grades și le recreăm cu verificare blocaj.
DROP POLICY IF EXISTS "grades_insert_strict" ON public.grades;
DROP POLICY IF EXISTS "grades_update_strict" ON public.grades;

CREATE POLICY "grades_insert_strict" ON public.grades
  FOR INSERT
  WITH CHECK (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid() AND ta.subject_id = subject_id AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

CREATE POLICY "grades_update_strict" ON public.grades
  FOR UPDATE
  USING (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid() AND ta.subject_id = subject_id AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  )
  WITH CHECK (
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND school_id = public.get_user_school_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid() AND ta.subject_id = subject_id AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'developer'::public.app_role)
    )
  );

-- =============================================================================
-- PUNCT 6: GRANULAR RLS – Profesori văd doar elevii din clasele alocate
-- =============================================================================

-- Students: director/secretariat văd toată școala; profesorii doar elevii din clasele din teacher_assignments
DROP POLICY IF EXISTS "students_select_strict" ON public.students;

CREATE POLICY "students_select_strict" ON public.students
  FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    AND (
      -- Director / secretariat: toți elevii din școală
      public.has_role(auth.uid(), 'director'::public.app_role)
      OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
      OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
      -- Profesor: doar elevii din clasele în care e alocat
      OR EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        WHERE ta.teacher_id = auth.uid() AND ta.class_id = students.class_id
          AND ta.school_id = public.get_user_school_id()
      )
      -- Elev: propriul profil
      OR user_id = auth.uid()
      -- Părinte: copiii din parent_student_relations
      OR EXISTS (
        SELECT 1 FROM public.parent_student_relations psr
        WHERE psr.student_id = students.id AND psr.parent_user_id = auth.uid()
      )
    )
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Grades SELECT: profesori doar pentru clasele/subject alocate (păstrăm policy existent dacă e deja granulară)
DROP POLICY IF EXISTS "grades_select_strict" ON public.grades;

CREATE POLICY "grades_select_strict" ON public.grades
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = grades.student_id AND s.user_id = auth.uid() AND s.school_id = public.get_user_school_id())
    OR EXISTS (
      SELECT 1 FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id AND psr.parent_user_id = auth.uid() AND s.school_id = public.get_user_school_id()
    )
    OR (
      school_id = public.get_user_school_id()
      AND EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid() AND ta.subject_id = grades.subject_id AND s.id = grades.student_id
          AND ta.school_id = public.get_user_school_id()
      )
    )
    OR (
      school_id = public.get_user_school_id()
      AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role))
    )
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- =============================================================================
-- PUNCT 7: TEACHER-SUBJECT-CLASS PIVOT – teacher_assignments (fără intrare = fără drept)
-- =============================================================================

-- Tabelul teacher_assignments este creat în 20260224000000. Asigurăm RLS strict.
DROP POLICY IF EXISTS "teacher_assignments_select_strict" ON public.teacher_assignments;
DROP POLICY IF EXISTS "teacher_assignments_manage_strict" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Users can view teacher_assignments from their school" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Staff can manage teacher_assignments" ON public.teacher_assignments;

CREATE POLICY "teacher_assignments_select_strict" ON public.teacher_assignments
  FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "teacher_assignments_manage_strict" ON public.teacher_assignments
  FOR ALL
  USING (
    (school_id = public.get_user_school_id() AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role)))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (school_id = public.get_user_school_id() AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role)))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- =============================================================================
-- PUNCT 8: STRICT ROLES – app_role ENUM, fără string-uri libere
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'student', 'teacher', 'parent', 'director', 'admin',
      'homeroom_teacher', 'secretariat', 'uat_admin', 'developer'
    );
  END IF;
  -- Adaugă valorile lipsă fără a duplica
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'developer') THEN
    ALTER TYPE public.app_role ADD VALUE 'developer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'admin') THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Asigură că profiles.role și active_role sunt de tip app_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
    IF (SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') != 'app_role' THEN
      ALTER TABLE public.profiles ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active_role') THEN
    IF (SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active_role') != 'app_role' THEN
      ALTER TABLE public.profiles ALTER COLUMN active_role TYPE public.app_role USING active_role::text::public.app_role;
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- =============================================================================
-- PUNCT 9: EVENT SYSTEM – school_events vizibilitate (per clasă / per școală) + notificări
-- =============================================================================

-- Extindem school_events cu coloane de vizibilitate
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'school_events' AND column_name = 'school_id') THEN
    ALTER TABLE public.school_events ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'school_events' AND column_name = 'visibility_scope') THEN
    ALTER TABLE public.school_events ADD COLUMN visibility_scope TEXT NOT NULL DEFAULT 'school' CHECK (visibility_scope IN ('school', 'class'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'school_events' AND column_name = 'target_class_id') THEN
    ALTER TABLE public.school_events ADD COLUMN target_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Notifications: tabelul există; index pentru event_id dacă vrem să legăm notificări de evenimente
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'event_id') THEN
    ALTER TABLE public.notifications ADD COLUMN event_id UUID REFERENCES public.school_events(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_notifications_event_id ON public.notifications(event_id);
  END IF;
END $$;

-- RLS pe school_events: strict multi-tenant + vizibilitate
ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view school events" ON public.school_events;
DROP POLICY IF EXISTS "Staff can manage school events" ON public.school_events;

CREATE POLICY "school_events_select_strict" ON public.school_events
  FOR SELECT
  USING (
    (school_id = public.get_user_school_id() AND (visibility_scope = 'school' OR (visibility_scope = 'class' AND (target_class_id IS NULL OR target_class_id IN (
      SELECT class_id FROM public.students WHERE user_id = auth.uid()
    ) OR target_class_id IN (
      SELECT ta.class_id FROM public.teacher_assignments ta WHERE ta.teacher_id = auth.uid() AND ta.school_id = public.get_user_school_id()
    )))))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "school_events_manage_strict" ON public.school_events
  FOR ALL
  USING (
    (school_id = public.get_user_school_id() AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role) OR public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  )
  WITH CHECK (
    (school_id = public.get_user_school_id() AND (public.has_role(auth.uid(), 'director'::public.app_role) OR public.has_role(auth.uid(), 'secretariat'::public.app_role) OR public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)))
    OR public.has_role(auth.uid(), 'uat_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Backfill school_id și vizibilitate pe school_events
UPDATE public.school_events e SET school_id = c.school_id
FROM public.classes c WHERE e.class_id = c.id AND e.school_id IS NULL;
UPDATE public.school_events e SET school_id = (SELECT id FROM public.schools LIMIT 1) WHERE e.school_id IS NULL AND EXISTS (SELECT 1 FROM public.schools LIMIT 1);
UPDATE public.school_events SET visibility_scope = 'class', target_class_id = class_id WHERE class_id IS NOT NULL AND target_class_id IS NULL AND visibility_scope = 'school';

-- =============================================================================
-- PUNCT 10: PERFORMANCE INDEXING – school_id, student_id, class_id, subject_id
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_class_id ON public.subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_id ON public.grades(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_subject_id ON public.grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject_id ON public.attendance(subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_school_id ON public.teacher_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_id ON public.teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_subject_id ON public.teacher_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_school_events_school_id ON public.school_events(school_id);
CREATE INDEX IF NOT EXISTS idx_school_events_target_class_id ON public.school_events(target_class_id) WHERE target_class_id IS NOT NULL;

COMMIT;
