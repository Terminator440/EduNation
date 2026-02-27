-- Migration: Attendance status enum (pending/motivated/unexcused), validated_by/at
-- RLS: profesor poate insera, NU poate modifica status; dirigintele poate valida
-- teacher_log with time limit (2h from scheduled time)

BEGIN;

-- 1) Attendance status: add validated_by, validated_at; migrate status to new values
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

-- Drop old check first, then migrate values, then add new check
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check1;

-- Migrate old status values: prezent->present, absent->unexcused, motivat->motivated, intarziat->pending
UPDATE public.attendance SET status = CASE
  WHEN status IN ('prezent', 'present') THEN 'present'
  WHEN status IN ('motivat', 'motivated') THEN 'motivated'
  WHEN status IN ('intarziat', 'pending') THEN 'pending'
  WHEN status IN ('absent', 'unexcused') THEN 'unexcused'
  ELSE COALESCE(status, 'pending')
END WHERE status IS NOT NULL;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_status_check CHECK (status IN ('present', 'pending', 'motivated', 'unexcused'));

-- 2) Restrict teacher from modifying status - only homeroom can validate
-- Replace old restrict_homeroom_attendance_update with unified logic
DROP TRIGGER IF EXISTS trg_restrict_homeroom_attendance_update ON public.attendance;

CREATE OR REPLACE FUNCTION public.restrict_teacher_attendance_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := (select auth.uid());
  IF uid IS NULL THEN RETURN NEW; END IF;

  -- Homeroom (not original recorder) can only set status to motivated
  IF has_role(uid, 'homeroom_teacher'::app_role) AND (OLD.teacher_id IS DISTINCT FROM uid) THEN
    IF NEW.status <> 'motivated' AND OLD.status <> NEW.status THEN
      RAISE EXCEPTION 'Homeroom can only validate (set status to motivated)';
    END IF;
    IF NEW.status = 'motivated' THEN
      NEW.validated_by := uid;
      NEW.validated_at := COALESCE(NEW.validated_at, now());
    END IF;
    RETURN NEW;
  END IF;

  -- Teacher (recording) cannot change status - only homeroom can validate
  IF OLD.teacher_id = uid AND (NOT has_role(uid, 'homeroom_teacher'::app_role)) THEN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'Teacher cannot modify attendance status; only homeroom can validate';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_teacher_attendance_status ON public.attendance;
CREATE TRIGGER trg_restrict_teacher_attendance_status
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.restrict_teacher_attendance_status_update();

-- 3) teacher_register time limit: refuse insert if > 2h after scheduled time
CREATE OR REPLACE FUNCTION public.teacher_register_time_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start time;
  v_scheduled_ts timestamptz;
  v_reg_date date;
  v_limit_hours int := 2;
BEGIN
  v_reg_date := COALESCE(
    (NEW).register_date,
    (NEW).date
  );
  IF v_reg_date IS NULL THEN RETURN NEW; END IF;
  SELECT start_time INTO v_start FROM public.timetable_entries WHERE id = NEW.timetable_entry_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_scheduled_ts := (v_reg_date + COALESCE(v_start, '08:00'::time))::timestamptz;
  IF now() > v_scheduled_ts + (v_limit_hours || ' hours')::interval THEN
    RAISE EXCEPTION 'Cannot sign register: more than % hours after scheduled time', v_limit_hours;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_register_time_check ON public.teacher_register;
CREATE TRIGGER trg_teacher_register_time_check
  BEFORE INSERT ON public.teacher_register
  FOR EACH ROW EXECUTE FUNCTION public.teacher_register_time_check();

COMMIT;
