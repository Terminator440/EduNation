-- Add production-grade workflow features:
-- - Grade statuses + soft delete
-- - Attendance excusal metadata + homeroom excusal ability
-- - Change/excusal requests (pending/approved/rejected)
-- - Timetable + teacher register (condica) foundations
-- - Automatic audit logging triggers for grades/attendance/register

BEGIN;

-- 0) Helpers: resolve current authenticated user from request JWT.
-- Works for PostgREST requests in Supabase.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.current_user_profile()
RETURNS TABLE(user_id uuid, full_name text, active_role public.app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, COALESCE(p.active_role, 'student'::public.app_role)
  FROM public.profiles p
  WHERE p.id = public.current_user_id();
$$;

-- 1) Grades: status + soft-delete + optional lineage
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'final',
  ADD COLUMN IF NOT EXISTS corrected_from uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grades_status_check'
  ) THEN
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_status_check CHECK (status IN ('draft','final','corrected'));
  END IF;
END $$;

-- 2) Attendance: add excusal metadata + soft-delete
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS excused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS excused_at timestamptz,
  ADD COLUMN IF NOT EXISTS excuse_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3) Requests tables
CREATE TABLE IF NOT EXISTS public.grade_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  requested_grade decimal(4,2),
  requested_description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.grade_change_requests ENABLE ROW LEVEL SECURITY;

-- Requester can read own requests
DROP POLICY IF EXISTS "Users can view own grade change requests" ON public.grade_change_requests;
CREATE POLICY "Users can view own grade change requests" ON public.grade_change_requests
  FOR SELECT USING (requested_by = (select auth.uid()));

-- Teachers can create requests for grades they created
DROP POLICY IF EXISTS "Teachers can create grade change requests" ON public.grade_change_requests;
CREATE POLICY "Teachers can create grade change requests" ON public.grade_change_requests
  FOR INSERT WITH CHECK (
    requested_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.grades g
      WHERE g.id = grade_id AND g.teacher_id = (select auth.uid())
    )
  );

-- Directors/Secretariat can manage all
DROP POLICY IF EXISTS "Staff can manage grade change requests" ON public.grade_change_requests;
CREATE POLICY "Staff can manage grade change requests" ON public.grade_change_requests
  FOR ALL USING (
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.attendance_excuse_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.attendance_excuse_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own attendance excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Users can view own attendance excuse requests" ON public.attendance_excuse_requests
  FOR SELECT USING (requested_by = (select auth.uid()));

-- Parents can create requests for their linked students; students can create for themselves
DROP POLICY IF EXISTS "Users can create attendance excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Users can create attendance excuse requests" ON public.attendance_excuse_requests
  FOR INSERT WITH CHECK (
    requested_by = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      WHERE a.id = attendance_id
        AND (
          s.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.parent_student_relations psr
            WHERE psr.parent_user_id = (select auth.uid()) AND psr.student_id = s.id
          )
        )
    )
  );

-- Homeroom teacher can view/manage requests for their class
DROP POLICY IF EXISTS "Homeroom can manage excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Homeroom can manage excuse requests" ON public.attendance_excuse_requests
  FOR ALL USING (
    has_role((select auth.uid()), 'homeroom_teacher'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      JOIN public.classes c ON c.id = s.class_id
      WHERE a.id = attendance_id AND c.teacher_id = (select auth.uid())
    )
  );

-- Directors/Secretariat can manage all
DROP POLICY IF EXISTS "Staff can manage attendance excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Staff can manage attendance excuse requests" ON public.attendance_excuse_requests
  FOR ALL USING (
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role)
  );

-- 4) Allow homeroom teacher to excuse absences in their class (update attendance rows)
-- RLS: add a dedicated UPDATE policy (scoped to students in homeroom class).
DROP POLICY IF EXISTS "Homeroom can update attendance for own class" ON public.attendance;
CREATE POLICY "Homeroom can update attendance for own class" ON public.attendance
  FOR UPDATE USING (
    has_role((select auth.uid()), 'homeroom_teacher'::app_role)
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE c.teacher_id = (select auth.uid())
    )
  )
  WITH CHECK (
    has_role((select auth.uid()), 'homeroom_teacher'::app_role)
    AND student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE c.teacher_id = (select auth.uid())
    )
  );

-- Enforce homeroom updates to be excusal-only when they are not the recording teacher.
CREATE OR REPLACE FUNCTION public.restrict_homeroom_attendance_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := public.current_user_id();
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- If the updater is a homeroom teacher but not the original recorder, allow only excusal.
  IF public.has_role(uid, 'homeroom_teacher'::app_role) AND (OLD.teacher_id IS DISTINCT FROM uid) THEN
    -- Only allow status change to 'motivat' and set excusal metadata.
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
      OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
      OR NEW.date IS DISTINCT FROM OLD.date
      OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Homeroom excusal can only update status/excusal fields.';
    END IF;

    IF NEW.status <> 'motivat' THEN
      RAISE EXCEPTION 'Homeroom can only set status to motivat.';
    END IF;

    NEW.excused_by := uid;
    NEW.excused_at := COALESCE(NEW.excused_at, now());
    -- excuse_reason may be set by UI
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_homeroom_attendance_update ON public.attendance;
CREATE TRIGGER trg_restrict_homeroom_attendance_update
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_homeroom_attendance_update();

-- Directors/Secretariat/Admin can manage grades and attendance (for controlled exceptions + audits)
DROP POLICY IF EXISTS "Staff can manage grades" ON public.grades;
CREATE POLICY "Staff can manage grades" ON public.grades
  FOR ALL USING (
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage attendance" ON public.attendance;
CREATE POLICY "Staff can manage attendance" ON public.attendance
  FOR ALL USING (
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role)
  );

-- 5) Timetable + teacher register (condica)
CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  period int NOT NULL CHECK (period BETWEEN 1 AND 12),
  start_time time,
  end_time time,
  room text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (class_id, weekday, period)
);

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view timetable entries" ON public.timetable_entries;
CREATE POLICY "Users can view timetable entries" ON public.timetable_entries
  FOR SELECT USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Staff can manage timetable entries" ON public.timetable_entries;
CREATE POLICY "Staff can manage timetable entries" ON public.timetable_entries
  FOR ALL USING (
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.teacher_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_entry_id uuid NOT NULL REFERENCES public.timetable_entries(id) ON DELETE CASCADE,
  register_date date NOT NULL,
  signed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'signed' CHECK (status IN ('signed','late','excused')),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (timetable_entry_id, register_date)
);

ALTER TABLE public.teacher_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can view own register" ON public.teacher_register;
CREATE POLICY "Teachers can view own register" ON public.teacher_register
  FOR SELECT USING (signed_by = (select auth.uid()));

DROP POLICY IF EXISTS "Teachers can sign own register" ON public.teacher_register;
CREATE POLICY "Teachers can sign own register" ON public.teacher_register
  FOR INSERT WITH CHECK (
    signed_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.timetable_entries te
      WHERE te.id = timetable_entry_id AND te.teacher_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can view all register" ON public.teacher_register;
CREATE POLICY "Staff can view all register" ON public.teacher_register
  FOR SELECT USING (
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role)
  );

-- 6) Automatic audit logging triggers (grades, attendance, teacher_register)
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
BEGIN
  uid := public.current_user_id();
  IF uid IS NULL THEN
    -- Ignore service tasks
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT p.full_name, COALESCE(p.active_role, 'student'::public.app_role)
  INTO uname, urole
  FROM public.profiles p
  WHERE p.id = uid;

  entity_id := COALESCE((NEW).id, (OLD).id);
  details := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'old', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    'new', CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  INSERT INTO public.audit_logs(user_id, user_name, active_role, action, entity_type, entity_id, details)
  VALUES (uid, COALESCE(uname, ''), COALESCE(urole, 'student'::public.app_role), TG_OP, TG_TABLE_NAME, entity_id, details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers if not present
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_teacher_register ON public.teacher_register;
CREATE TRIGGER trg_audit_teacher_register
  AFTER INSERT OR UPDATE OR DELETE ON public.teacher_register
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

COMMIT;
