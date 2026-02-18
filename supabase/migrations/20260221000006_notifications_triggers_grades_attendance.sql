-- Migration: Automatic notifications for grades and attendance
-- Creates triggers that insert notifications when new grades or attendance records are added
-- Notifications are sent to the student (and parent if linked)

BEGIN;

-- ============================================================================
-- PART 1: ENSURE NOTIFICATIONS TABLE HAS REQUIRED COLUMNS
-- ============================================================================

-- Ensure notifications table has message, is_read columns (from previous migration)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS link TEXT;

-- Sync is_read from read_at if needed
UPDATE public.notifications
SET is_read = (read_at IS NOT NULL)
WHERE is_read IS FALSE AND read_at IS NOT NULL;

-- ============================================================================
-- PART 2: TRIGGER FUNCTION FOR GRADES NOTIFICATIONS
-- ============================================================================

-- Function to create notification when a new grade is added
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
BEGIN
  -- Get student's user_id
  SELECT user_id INTO v_student_user_id
  FROM public.students
  WHERE id = NEW.student_id;

  -- Get subject name
  SELECT name INTO v_subject_name
  FROM public.subjects
  WHERE id = NEW.subject_id;

  -- Skip if student has no user_id (not yet activated)
  IF v_student_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create message
  v_message := format('Ai primit nota %s la %s', NEW.grade, COALESCE(v_subject_name, 'materie necunoscută'));
  IF NEW.description IS NOT NULL AND NEW.description != '' THEN
    v_message := v_message || format(' (%s)', NEW.description);
  END IF;

  -- Insert notification for student
  INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
  VALUES (
    v_student_user_id,
    'grade',
    'Notă nouă',
    v_message,
    false,
    format('/grades')
  );

  -- Also notify parent(s) if linked
  INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
  SELECT
    psr.parent_user_id,
    'grade',
    format('Notă nouă pentru %s', COALESCE(s.full_name, 'elevul tău')),
    v_message,
    false,
    format('/grades')
  FROM public.parent_student_relations psr
  JOIN public.students s ON s.id = psr.student_id
  WHERE psr.student_id = NEW.student_id
    AND psr.parent_user_id IS NOT NULL;

  RETURN NEW;
END;
$$;

-- Attach trigger to grades table (AFTER INSERT)
DROP TRIGGER IF EXISTS trg_notify_grade_added ON public.grades;
CREATE TRIGGER trg_notify_grade_added
  AFTER INSERT ON public.grades
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_grade_added();

-- ============================================================================
-- PART 3: TRIGGER FUNCTION FOR ATTENDANCE NOTIFICATIONS
-- ============================================================================

-- Function to create notification when a new attendance record is added
CREATE OR REPLACE FUNCTION public.notify_attendance_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_user_id UUID;
  v_subject_name TEXT;
  v_status_text TEXT;
  v_message TEXT;
BEGIN
  -- Get student's user_id
  SELECT user_id INTO v_student_user_id
  FROM public.students
  WHERE id = NEW.student_id;

  -- Get subject name
  SELECT name INTO v_subject_name
  FROM public.subjects
  WHERE id = NEW.subject_id;

  -- Skip if student has no user_id (not yet activated)
  IF v_student_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine status text (use new enum if available, fallback to old status)
  IF NEW.attendance_status IS NOT NULL THEN
    v_status_text := CASE NEW.attendance_status
      WHEN 'nemotivata'::public.attendance_status THEN 'absență nemotivată'
      WHEN 'motivata'::public.attendance_status THEN 'absență motivată'
      WHEN 'intarziere'::public.attendance_status THEN 'întârziere'
      ELSE 'prezență'
    END;
  ELSE
    v_status_text := CASE NEW.status
      WHEN 'unexcused' THEN 'absență nemotivată'
      WHEN 'motivated' THEN 'absență motivată'
      WHEN 'pending' THEN 'întârziere'
      WHEN 'present' THEN 'prezență'
      ELSE COALESCE(NEW.status, 'prezență')
    END;
  END IF;

  -- Only notify for absences (not present)
  IF (NEW.attendance_status IS NOT NULL AND NEW.attendance_status IN ('nemotivata'::public.attendance_status, 'motivata'::public.attendance_status))
     OR (NEW.attendance_status IS NULL AND NEW.status IN ('unexcused', 'motivated', 'absent')) THEN
    
    -- Create message
    v_message := format('Ai fost marcat cu %s la %s', v_status_text, COALESCE(v_subject_name, 'materie necunoscută'));

    -- Insert notification for student
    INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
    VALUES (
      v_student_user_id,
      'attendance',
      'Prezență înregistrată',
      v_message,
      false,
      format('/attendance')
    );

    -- Also notify parent(s) if linked
    INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
    SELECT
      psr.parent_user_id,
      'attendance',
      format('Prezență înregistrată pentru %s', COALESCE(s.full_name, 'elevul tău')),
      v_message,
      false,
      format('/attendance')
    FROM public.parent_student_relations psr
    JOIN public.students s ON s.id = psr.student_id
    WHERE psr.student_id = NEW.student_id
      AND psr.parent_user_id IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to attendance table (AFTER INSERT)
DROP TRIGGER IF EXISTS trg_notify_attendance_added ON public.attendance;
CREATE TRIGGER trg_notify_attendance_added
  AFTER INSERT ON public.attendance
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.notify_attendance_added();

-- ============================================================================
-- PART 4: ENSURE RLS POLICIES ALLOW TRIGGER INSERTS
-- ============================================================================

-- Triggers run as SECURITY DEFINER, so they bypass RLS automatically
-- However, we ensure policies exist for normal users to insert their own notifications
-- The "Staff insert notifications" policy already allows staff to insert, which is fine

-- Ensure the policy exists for trigger inserts (triggers use SECURITY DEFINER, so they bypass RLS)
-- But we document that triggers can insert notifications for any user_id

-- Grant execute permissions (though triggers run as SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.notify_grade_added TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_attendance_added TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.notify_grade_added IS 'Trigger function that creates notifications when a new grade is added. Notifies student and parent(s).';
COMMENT ON FUNCTION public.notify_attendance_added IS 'Trigger function that creates notifications when a new attendance record (absence) is added. Notifies student and parent(s).';

COMMIT;
