-- Migration: Define academic relationships
-- 1. Add profile field to classes table (e.g., 'real', 'umanist', 'tehnic')
-- 2. Ensure class_subjects junction table exists and links class-subject-teacher
-- 3. Add class_id to profiles table for students
-- This ensures teachers see only their classes and students see only their subjects

BEGIN;

-- ============================================================================
-- PART 1: ADD PROFILE FIELD TO CLASSES TABLE
-- ============================================================================

-- Add profile column to classes if it doesn't exist
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS profile TEXT;

-- Add comment
COMMENT ON COLUMN public.classes.profile IS 'Class profile/specialization (e.g., "real", "umanist", "tehnic", "sportiv").';

-- ============================================================================
-- PART 2: ENSURE CLASS_SUBJECTS JUNCTION TABLE EXISTS AND IS COMPLETE
-- ============================================================================

-- Verify class_subjects table exists (should exist from previous migration)
-- If not, create it
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (class_id, subject_id, teacher_id)
);

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_class_subjects_class_id ON public.class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject_id ON public.class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher_id ON public.class_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school_id ON public.class_subjects(school_id);

-- Ensure RLS is enabled
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

-- Ensure trigger for school_id exists
CREATE OR REPLACE FUNCTION public.set_class_subject_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    -- Try to get school_id from class
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
    
    -- If still NULL, try from subject
    IF NEW.school_id IS NULL THEN
      SELECT school_id INTO NEW.school_id
      FROM public.subjects
      WHERE id = NEW.subject_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_class_subject_school_id ON public.class_subjects;
CREATE TRIGGER trg_set_class_subject_school_id
  BEFORE INSERT OR UPDATE ON public.class_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_class_subject_school_id();

-- Ensure RLS policies exist for class_subjects
DROP POLICY IF EXISTS "Users can view class_subjects from their school" ON public.class_subjects;
CREATE POLICY "Users can view class_subjects from their school" ON public.class_subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage class_subjects" ON public.class_subjects;
CREATE POLICY "Staff can manage class_subjects" ON public.class_subjects
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- ============================================================================
-- PART 3: ADD CLASS_ID TO PROFILES TABLE FOR STUDENTS
-- ============================================================================

-- Add class_id column to profiles if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

-- Add comment
COMMENT ON COLUMN public.profiles.class_id IS 'For students: links profile directly to their class. Should match students.class_id for the active student record.';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_class_id ON public.profiles(class_id);

-- ============================================================================
-- PART 4: SYNC CLASS_ID FROM STUDENTS TO PROFILES
-- ============================================================================

-- Function to sync class_id from students to profiles
-- This ensures profiles.class_id matches the student's current class
CREATE OR REPLACE FUNCTION public.sync_profile_class_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a student record is created or updated, sync class_id to profile
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET class_id = NEW.class_id
    WHERE id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to sync class_id when students table changes
DROP TRIGGER IF EXISTS trg_sync_profile_class_id ON public.students;
CREATE TRIGGER trg_sync_profile_class_id
  AFTER INSERT OR UPDATE OF class_id ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_class_id();

-- Initial sync: update profiles.class_id from existing students
UPDATE public.profiles p
SET class_id = s.class_id
FROM public.students s
WHERE s.user_id = p.id
  AND s.is_active = true
  AND (p.class_id IS NULL OR p.class_id != s.class_id);

-- ============================================================================
-- PART 5: ENSURE SUBJECTS TABLE HAS PROPER STRUCTURE
-- ============================================================================

-- Ensure subjects table has school_id (should exist from previous migration)
-- If not, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subjects' 
    AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.subjects 
    ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
    
    -- Backfill school_id from class
    UPDATE public.subjects s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
    
    -- Make NOT NULL after backfilling
    ALTER TABLE public.subjects
    ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 6: UPDATE RLS POLICIES FOR BETTER ISOLATION
-- ============================================================================

-- Ensure classes RLS policies allow students to see their own class
-- Note: This policy is additive - it works alongside existing "Users can view classes from their school" policy
DROP POLICY IF EXISTS "Students can view own class" ON public.classes;
CREATE POLICY "Students can view own class" ON public.classes
  FOR SELECT
  USING (
    -- Student can see their own class (via profiles.class_id)
    id IN (
      SELECT class_id FROM public.profiles WHERE id = auth.uid() AND class_id IS NOT NULL
    )
    OR
    -- Student can see their class via students table
    id IN (
      SELECT class_id FROM public.students WHERE user_id = auth.uid()
    )
    OR
    -- Teachers can see classes where they teach subjects
    id IN (
      SELECT DISTINCT cs.class_id
      FROM public.class_subjects cs
      WHERE cs.teacher_id = auth.uid()
    )
    OR
    -- Staff can see all classes from their school
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- Ensure subjects RLS policies allow students to see only their subjects
-- Note: This policy is additive - it works alongside existing "Users can view subjects from their school" policy
DROP POLICY IF EXISTS "Students can view own subjects" ON public.subjects;
CREATE POLICY "Students can view own subjects" ON public.subjects
  FOR SELECT
  USING (
    -- Student can see subjects from their class
    class_id IN (
      SELECT class_id FROM public.profiles WHERE id = auth.uid() AND class_id IS NOT NULL
    )
    OR
    class_id IN (
      SELECT class_id FROM public.students WHERE user_id = auth.uid()
    )
    OR
    -- Teachers can see subjects they teach
    id IN (
      SELECT DISTINCT cs.subject_id
      FROM public.class_subjects cs
      WHERE cs.teacher_id = auth.uid()
    )
    OR
    -- Staff can see all subjects from their school
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'teacher'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    )
    OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

COMMIT;
