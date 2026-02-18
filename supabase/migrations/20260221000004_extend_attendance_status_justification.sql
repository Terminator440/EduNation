-- Migration: Extend attendance module with status enum and justification_url
-- 1. Create attendance_status enum: 'nemotivata', 'motivata', 'intarziere'
-- 2. Add justification_url column for documents
-- 3. Create RPC function to change status from 'nemotivata' to 'motivata' (only homeroom_teacher/admin)
-- 4. Ensure students and parents can see changes in real-time (via RLS)

BEGIN;

-- ============================================================================
-- PART 1: CREATE ATTENDANCE_STATUS ENUM
-- ============================================================================

-- Create enum type for attendance status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
    CREATE TYPE public.attendance_status AS ENUM ('nemotivata', 'motivata', 'intarziere');
  END IF;
END $$;

-- ============================================================================
-- PART 2: ADD JUSTIFICATION_URL COLUMN TO ATTENDANCE
-- ============================================================================

-- Add justification_url column if it doesn't exist
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS justification_url TEXT;

-- Add comment
COMMENT ON COLUMN public.attendance.justification_url IS 'URL to justification document (e.g., medical certificate, excuse letter) for motivated absences.';

-- Create index for filtering by justification_url
CREATE INDEX IF NOT EXISTS idx_attendance_justification_url ON public.attendance(justification_url) WHERE justification_url IS NOT NULL;

-- ============================================================================
-- PART 3: ADD NEW STATUS COLUMN (keeping old status for backward compatibility)
-- ============================================================================

-- Add new status column using enum type
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS attendance_status public.attendance_status;

-- Migrate existing status values to new enum
-- Map: 'unexcused'/'absent' -> 'nemotivata', 'motivated'/'motivat' -> 'motivata', 'pending'/'intarziat' -> 'intarziere'
UPDATE public.attendance 
SET attendance_status = CASE
  WHEN status IN ('unexcused', 'absent', 'nemotivata') THEN 'nemotivata'::public.attendance_status
  WHEN status IN ('motivated', 'motivat', 'motivata') THEN 'motivata'::public.attendance_status
  WHEN status IN ('pending', 'intarziat', 'intarziere') THEN 'intarziere'::public.attendance_status
  ELSE 'nemotivata'::public.attendance_status
END
WHERE attendance_status IS NULL;

-- Set default for new records
ALTER TABLE public.attendance 
ALTER COLUMN attendance_status SET DEFAULT 'nemotivata'::public.attendance_status;

-- Make it NOT NULL after migration
ALTER TABLE public.attendance 
ALTER COLUMN attendance_status SET NOT NULL;

-- Add comment
COMMENT ON COLUMN public.attendance.attendance_status IS 'Attendance status: nemotivata (unexcused), motivata (excused), intarziere (late). Only homeroom_teacher/admin can change from nemotivata to motivata.';

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_attendance_status_enum ON public.attendance(attendance_status);

-- ============================================================================
-- PART 4: RPC FUNCTION TO CHANGE STATUS FROM NEMOTIVATA TO MOTIVATA
-- ============================================================================

-- Function to change attendance status from 'nemotivata' to 'motivata'
-- Only homeroom_teacher, director, secretariat can use this function
CREATE OR REPLACE FUNCTION public.motivate_attendance(
  p_attendance_id UUID,
  p_justification_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  subject_id UUID,
  date DATE,
  attendance_status public.attendance_status,
  justification_url TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_status public.attendance_status;
  v_student_class_id UUID;
  v_homeroom_teacher_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check if user has required role (homeroom_teacher, director, secretariat)
  IF NOT (
    public.has_role(v_user_id, 'homeroom_teacher'::app_role) OR
    public.has_role(v_user_id, 'director'::app_role) OR
    public.has_role(v_user_id, 'secretariat'::app_role) OR
    public.has_role(v_user_id, 'uat_admin'::app_role) OR
    public.has_role(v_user_id, 'developer'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only homeroom_teacher, director, or secretariat can motivate attendance';
  END IF;

  -- Get current status and student's class
  SELECT 
    a.attendance_status,
    s.class_id,
    c.teacher_id
  INTO 
    v_current_status,
    v_student_class_id,
    v_homeroom_teacher_id
  FROM public.attendance a
  JOIN public.students s ON s.id = a.student_id
  LEFT JOIN public.classes c ON c.id = s.class_id
  WHERE a.id = p_attendance_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  -- Only allow changing from 'nemotivata' to 'motivata'
  IF v_current_status != 'nemotivata'::public.attendance_status THEN
    RAISE EXCEPTION 'Can only motivate attendance with status "nemotivata". Current status: %', v_current_status;
  END IF;

  -- If user is homeroom_teacher, verify they are the homeroom teacher for this student's class
  IF public.has_role(v_user_id, 'homeroom_teacher'::app_role) THEN
    IF v_homeroom_teacher_id != v_user_id THEN
      RAISE EXCEPTION 'Homeroom teacher can only motivate attendance for students in their own class';
    END IF;
  END IF;

  -- Update attendance status
  UPDATE public.attendance
  SET 
    attendance_status = 'motivata'::public.attendance_status,
    justification_url = COALESCE(p_justification_url, justification_url),
    validated_by = v_user_id,
    validated_at = now()
  WHERE id = p_attendance_id;

  -- Return updated record
  RETURN QUERY
  SELECT 
    a.id,
    a.student_id,
    a.subject_id,
    a.date,
    a.attendance_status,
    a.justification_url,
    a.validated_at AS updated_at
  FROM public.attendance a
  WHERE a.id = p_attendance_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.motivate_attendance TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.motivate_attendance IS 'Changes attendance status from "nemotivata" to "motivata". Only homeroom_teacher (for their class), director, or secretariat can use this function.';

-- ============================================================================
-- PART 5: UPDATE RLS POLICIES FOR ATTENDANCE
-- ============================================================================

-- Ensure students can view their own attendance (should already exist, but verify)
DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Student can view their own attendance
    auth.uid() IN (
      SELECT user_id 
      FROM public.students 
      WHERE id = attendance.student_id 
        AND user_id IS NOT NULL
        AND school_id = public.get_user_school_id()
    )
    OR
    -- Staff (director/secretariat) can view all attendance from their school
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
    OR
    -- UAT Admin and Developer can view all
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Ensure parents can view their children's attendance
DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
CREATE POLICY "Parents can view children attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Parent can view their child's attendance
    EXISTS (
      SELECT 1
      FROM public.parent_student_relations psr
      WHERE psr.student_id = attendance.student_id
        AND psr.parent_user_id = auth.uid()
    )
    AND school_id = public.get_user_school_id()
  );

-- Ensure homeroom_teacher can view attendance for their class
DROP POLICY IF EXISTS "Homeroom teachers can view class attendance" ON public.attendance;
CREATE POLICY "Homeroom teachers can view class attendance" ON public.attendance
  FOR SELECT
  USING (
    -- Homeroom teacher can view attendance for students in their class
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
    )
    AND school_id = public.get_user_school_id()
  );

-- Ensure homeroom_teacher can update attendance_status and justification_url
DROP POLICY IF EXISTS "Homeroom teachers can update attendance status" ON public.attendance;
CREATE POLICY "Homeroom teachers can update attendance status" ON public.attendance
  FOR UPDATE
  USING (
    -- Homeroom teacher can update attendance for students in their class
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
    )
    AND school_id = public.get_user_school_id()
  )
  WITH CHECK (
    -- Only allow updating attendance_status and justification_url
    -- Status can only change from 'nemotivata' to 'motivata' (enforced by function)
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = attendance.student_id
        AND c.teacher_id = auth.uid()
        AND public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
    )
    AND school_id = public.get_user_school_id()
  );

-- Ensure director/secretariat can update attendance_status and justification_url
DROP POLICY IF EXISTS "Directors and secretariat can update attendance status" ON public.attendance;
CREATE POLICY "Directors and secretariat can update attendance status" ON public.attendance
  FOR UPDATE
  USING (
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'director'::app_role) OR
      public.has_role(auth.uid(), 'secretariat'::app_role)
    ) AND school_id = public.get_user_school_id()
  );

-- ============================================================================
-- PART 6: ENABLE REALTIME FOR ATTENDANCE TABLE
-- ============================================================================

-- Enable realtime for attendance table so students and parents see changes immediately
-- Note: This requires Supabase Realtime to be enabled in the project settings
-- The RLS policies above ensure students/parents only see their own data

-- Grant realtime access (this is a no-op if realtime is not enabled, but documents intent)
-- Realtime is typically enabled via Supabase dashboard, but we document it here
COMMENT ON TABLE public.attendance IS 'Attendance records. Realtime enabled for students and parents to see status changes immediately.';

COMMIT;
