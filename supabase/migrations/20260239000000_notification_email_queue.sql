-- =============================================================================
-- Coadă notificări email (pentru părinți: notă nouă, absență).
-- Inserări din trigger; trimiterea se face din Edge Function sau cron.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_email_queue_user_id ON public.notification_email_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_email_queue_sent_at ON public.notification_email_queue(sent_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_email_queue_created_at ON public.notification_email_queue(created_at);

COMMENT ON TABLE public.notification_email_queue IS 'Coadă pentru trimitere email (părinți: notă nouă, absență). Procesată de Edge Function.';

ALTER TABLE public.notification_email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_email_queue_no_direct_select" ON public.notification_email_queue;
CREATE POLICY "notification_email_queue_no_direct_select" ON public.notification_email_queue
  FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.notify_parents_new_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_subject_name TEXT;
  v_student_name TEXT;
BEGIN
  SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
  SELECT full_name INTO v_student_name FROM public.students WHERE id = NEW.student_id;
  FOR v_parent_id IN
    SELECT psr.parent_user_id
    FROM public.parent_student_relations psr
    WHERE psr.student_id = NEW.student_id
  LOOP
    INSERT INTO public.notification_email_queue (user_id, type, payload)
    VALUES (v_parent_id, 'grade.new', jsonb_build_object(
      'student_name', v_student_name, 'subject_name', v_subject_name,
      'grade', NEW.grade, 'date', NEW.date, 'grade_id', NEW.id
    ));
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_parents_new_grade ON public.grades;
CREATE TRIGGER trg_notify_parents_new_grade
  AFTER INSERT ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.notify_parents_new_grade();

CREATE OR REPLACE FUNCTION public.notify_parents_new_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_subject_name TEXT;
  v_student_name TEXT;
BEGIN
  IF NEW.status NOT IN ('absent', 'intarziat') THEN RETURN NEW; END IF;
  SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
  SELECT full_name INTO v_student_name FROM public.students WHERE id = NEW.student_id;
  FOR v_parent_id IN
    SELECT psr.parent_user_id FROM public.parent_student_relations psr WHERE psr.student_id = NEW.student_id
  LOOP
    INSERT INTO public.notification_email_queue (user_id, type, payload)
    VALUES (v_parent_id, 'attendance.absent', jsonb_build_object(
      'student_name', v_student_name, 'subject_name', v_subject_name,
      'date', NEW.date, 'status', NEW.status, 'attendance_id', NEW.id
    ));
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_parents_new_attendance ON public.attendance;
CREATE TRIGGER trg_notify_parents_new_attendance
  AFTER INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.notify_parents_new_attendance();

COMMIT;
