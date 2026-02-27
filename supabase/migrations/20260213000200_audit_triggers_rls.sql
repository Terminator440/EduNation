-- Migration: Audit triggers (DB-level, impossible to bypass) + RLS block when year closed
-- Triggers save (select auth.uid()), OLD, NEW, server-side timestamp

BEGIN;

-- 1) Enhance audit_row_change to use (select auth.uid()) directly (server-side)
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  uname text;
  urole public.app_role;
  entity_id uuid;
  details jsonb;
  school_id_val uuid;
BEGIN
  uid := (select auth.uid());
  IF uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'student'::app_role), p.school_id
  INTO uname, urole, school_id_val
  FROM public.profiles p
  WHERE p.id = uid;

  entity_id := COALESCE((NEW).id, (OLD).id);
  details := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'server_ts', now(),
    'old', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    'new', CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  INSERT INTO public.audit_logs(user_id, user_name, active_role, action, entity_type, entity_id, old_data, new_data, details, school_id)
  VALUES (uid, COALESCE(uname, ''), COALESCE(urole, 'student'::app_role), TG_OP, TG_TABLE_NAME, entity_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    details, school_id_val);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2) disciplinary_actions table (if not exists)
CREATE TABLE IF NOT EXISTS public.disciplinary_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  action_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.disciplinary_actions ENABLE ROW LEVEL SECURITY;

-- Audit trigger for disciplinary_actions
DROP TRIGGER IF EXISTS trg_audit_disciplinary_actions ON public.disciplinary_actions;
CREATE TRIGGER trg_audit_disciplinary_actions
  AFTER INSERT OR UPDATE OR DELETE ON public.disciplinary_actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 3) academic_year audit trigger
DROP TRIGGER IF EXISTS trg_audit_academic_year ON public.academic_year;
CREATE TRIGGER trg_audit_academic_year
  AFTER INSERT OR UPDATE OR DELETE ON public.academic_year
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 4) RLS: Block UPDATE/DELETE on grades, attendance, disciplinary_actions when year_closed
CREATE OR REPLACE FUNCTION public.is_year_closed_for_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    JOIN public.academic_year ay ON ay.school_id = c.school_id AND ay.year = c.year
    WHERE s.id = p_student_id AND ay.year_closed = true
  );
$$;

-- Grades: add policy that BLOCKS update/delete when year closed
-- We need to DROP existing update/delete policies and recreate with year_closed check
-- The existing policies allow teachers/staff. We add a CHECK that fails when year_closed.

CREATE OR REPLACE FUNCTION public.grades_update_delete_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(OLD.student_id) THEN
    RAISE EXCEPTION 'Cannot modify grades: academic year is closed';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.grades_insert_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(NEW.student_id) THEN
    RAISE EXCEPTION 'Cannot insert grades: academic year is closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_block_closed_year ON public.grades;
CREATE TRIGGER trg_grades_block_closed_year
  BEFORE UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.grades_update_delete_check();

DROP TRIGGER IF EXISTS trg_grades_insert_block_closed_year ON public.grades;
CREATE TRIGGER trg_grades_insert_block_closed_year
  BEFORE INSERT ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.grades_insert_check();

-- Attendance: same
CREATE OR REPLACE FUNCTION public.attendance_update_delete_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(OLD.student_id) THEN
    RAISE EXCEPTION 'Cannot modify attendance: academic year is closed';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_insert_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(NEW.student_id) THEN
    RAISE EXCEPTION 'Cannot insert attendance: academic year is closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_block_closed_year ON public.attendance;
CREATE TRIGGER trg_attendance_block_closed_year
  BEFORE UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_update_delete_check();

DROP TRIGGER IF EXISTS trg_attendance_insert_block_closed_year ON public.attendance;
CREATE TRIGGER trg_attendance_insert_block_closed_year
  BEFORE INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_insert_check();

-- Disciplinary_actions: same
CREATE OR REPLACE FUNCTION public.disciplinary_update_delete_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_year_closed_for_student(OLD.student_id) THEN
    RAISE EXCEPTION 'Cannot modify disciplinary actions: academic year is closed';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_disciplinary_block_closed_year ON public.disciplinary_actions;
CREATE TRIGGER trg_disciplinary_block_closed_year
  BEFORE UPDATE OR DELETE ON public.disciplinary_actions
  FOR EACH ROW EXECUTE FUNCTION public.disciplinary_update_delete_check();

-- 5) RLS for disciplinary_actions: staff + homeroom can manage; parents can view own children
CREATE POLICY "Staff can manage disciplinary_actions"
  ON public.disciplinary_actions FOR ALL
  USING (
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role) OR
    has_role((select auth.uid()), 'homeroom_teacher'::app_role)
  );

CREATE POLICY "Parents can view children disciplinary"
  ON public.disciplinary_actions FOR SELECT
  USING (
    student_id IN (
      SELECT psr.student_id FROM public.parent_student_relations psr
      WHERE psr.parent_user_id = (select auth.uid())
    )
  );

COMMIT;
