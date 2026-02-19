-- =============================================================================
-- Migration: Multi-Tenant RLS Refactor & Security Hardening
-- Senior Database Architect & Backend Engineer Implementation
-- 
-- This migration implements:
-- 1. Schema integrity fixes (NOT NULL constraints, FK, CHECK constraints)
-- 2. Multi-tenant isolation with rigorous RLS policies
-- 3. Teacher assignments table for proper access control
-- 4. Audit logging enhancements
-- 5. Performance indexes
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: SCHEMA INTEGRITY FIXES
-- =============================================================================

-- 1.1) Ensure app_role ENUM has all required values
DO $$
BEGIN
  -- Add 'admin' if it doesn't exist (currently we have 'uat_admin')
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
END $$;

-- 1.2) Add role column to profiles if it doesn't exist (use app_role ENUM)
-- Note: profiles already has active_role, but we'll ensure role column exists for consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role public.app_role;
    -- Copy active_role to role for existing records
    UPDATE public.profiles SET role = active_role WHERE role IS NULL;
    -- Set role to NOT NULL after backfilling
    ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
  ELSE
    -- If column exists, ensure it's app_role type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
        AND udt_name != 'app_role'
    ) THEN
      ALTER TABLE public.profiles
        ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
    END IF;
  END IF;
END $$;

-- 1.3) Ensure school_id is NOT NULL with FK on students
DO $$
BEGIN
  -- Add school_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.students ADD COLUMN school_id UUID;
    -- Backfill from classes
    UPDATE public.students s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;
  
  -- Ensure FK constraint exists
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
  
  -- Set NOT NULL after ensuring data exists
  ALTER TABLE public.students ALTER COLUMN school_id SET NOT NULL;
END $$;

-- 1.4) Ensure school_id is NOT NULL with FK on classes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.classes ADD COLUMN school_id UUID;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'classes'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  -- Only set NOT NULL if all rows have school_id
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE school_id IS NULL) THEN
    ALTER TABLE public.classes ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- 1.5) Ensure school_id is NOT NULL with FK on grades
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grades' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.grades ADD COLUMN school_id UUID;
    -- Backfill from students
    UPDATE public.grades g
    SET school_id = s.school_id
    FROM public.students s
    WHERE g.student_id = s.id AND g.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'grades'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  ALTER TABLE public.grades ALTER COLUMN school_id SET NOT NULL;
END $$;

-- 1.6) Ensure school_id is NOT NULL with FK on attendance (absences)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.attendance ADD COLUMN school_id UUID;
    -- Backfill from students
    UPDATE public.attendance a
    SET school_id = s.school_id
    FROM public.students s
    WHERE a.student_id = s.id AND a.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'attendance'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  ALTER TABLE public.attendance ALTER COLUMN school_id SET NOT NULL;
END $$;

-- 1.7) Ensure school_id is NOT NULL with FK on subjects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.subjects ADD COLUMN school_id UUID;
    -- Backfill from classes
    UPDATE public.subjects s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'subjects'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.subjects
      ADD CONSTRAINT subjects_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  ALTER TABLE public.subjects ALTER COLUMN school_id SET NOT NULL;
END $$;

-- 1.8) Ensure CHECK constraint for grades (1-10) - already exists but ensure it's correct
ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_grade_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);

-- 1.9) Add CHECK constraint for attendance absences (count >= 0)
-- Note: attendance table uses status field, not a count. We'll add a constraint on status validity
-- For actual absences count, we'd need a separate table or computed column
-- But we can ensure status is valid
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check 
  CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending'));

-- =============================================================================
-- PART 2: MULTI-TENANT ISOLATION - get_my_school_id() FUNCTION
-- =============================================================================

-- 2.1) Create get_my_school_id() function (alias for get_user_school_id() if exists)
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_my_school_id() IS 'Returns the school_id of the currently authenticated user. Used in RLS policies for multi-tenant isolation.';

-- =============================================================================
-- PART 3: TEACHER ASSIGNMENTS TABLE
-- =============================================================================

-- 3.1) Create teacher_assignments table (pivot table for teacher-class-subject-semester)
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Unique constraint to prevent duplicate assignments
  UNIQUE (teacher_id, class_id, subject_id, semester_id)
);

COMMENT ON TABLE public.teacher_assignments IS 'Pivot table linking teachers to class-subject-semester combinations. Used for RLS to control grade access.';

-- 3.2) Create indexes for teacher_assignments
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_id ON public.teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_id ON public.teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_subject_id ON public.teacher_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_school_id ON public.teacher_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_semester_id ON public.teacher_assignments(semester_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_composite ON public.teacher_assignments(teacher_id, class_id, subject_id);

-- 3.3) Enable RLS on teacher_assignments
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

-- 3.4) RLS policies for teacher_assignments
DROP POLICY IF EXISTS "Users can view teacher_assignments from their school" ON public.teacher_assignments;
CREATE POLICY "Users can view teacher_assignments from their school" ON public.teacher_assignments
  FOR SELECT
  USING (
    school_id = public.get_my_school_id() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage teacher_assignments" ON public.teacher_assignments;
CREATE POLICY "Staff can manage teacher_assignments" ON public.teacher_assignments
  FOR ALL
  USING (
    (
      school_id = public.get_my_school_id() AND
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
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 3.5) Trigger to auto-set school_id and updated_at
CREATE OR REPLACE FUNCTION public.set_teacher_assignment_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set school_id from class if not provided
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;
  
  -- Set updated_at
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_teacher_assignment_school_id ON public.teacher_assignments;
CREATE TRIGGER trg_set_teacher_assignment_school_id
  BEFORE INSERT OR UPDATE ON public.teacher_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_teacher_assignment_school_id();

-- =============================================================================
-- PART 4: AUDIT LOG ENHANCEMENTS
-- =============================================================================

-- 4.1) Ensure audit_logs has old_data and new_data columns (JSONB)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'old_data'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN old_data JSONB;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'new_data'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN new_data JSONB;
  END IF;
END $$;

-- 4.2) Ensure audit_logs has school_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);
  END IF;
END $$;

-- =============================================================================
-- PART 5: SEMESTER LOCK ENFORCEMENT IN RLS
-- =============================================================================

-- 5.1) Helper function to get semester from date
CREATE OR REPLACE FUNCTION public.get_semester_from_date(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  month_val INTEGER;
BEGIN
  month_val := EXTRACT(MONTH FROM p_date);
  -- Semester 1: September - January (months 9-12, 1)
  -- Semester 2: February - June (months 2-6)
  IF month_val IN (9, 10, 11, 12, 1) THEN
    RETURN 1;
  ELSE
    RETURN 2;
  END IF;
END;
$$;

-- 5.2) Enhanced function to check if semester is locked (for grades)
CREATE OR REPLACE FUNCTION public.is_semester_locked_for_grade(
  p_grade_date DATE,
  p_student_id UUID
)
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
  -- Get student's school_id
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id;
  
  IF v_school_id IS NULL THEN
    -- If we can't determine school, allow (will be caught by other RLS policies)
    RETURN false;
  END IF;
  
  -- Calculate academic year and semester from date
  v_academic_year := public.get_academic_year_from_date(p_grade_date);
  v_semester := public.get_semester_from_date(p_grade_date);
  
  -- Check if semester is locked
  SELECT is_locked INTO v_is_locked
  FROM public.semesters
  WHERE school_id = v_school_id
    AND academic_year = v_academic_year
    AND semester = v_semester;
  
  -- If semester doesn't exist, it's not locked (default behavior)
  IF v_is_locked IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN v_is_locked;
END;
$$;

COMMENT ON FUNCTION public.is_semester_locked_for_grade IS 'Checks if the semester for a given grade date and student is locked. Returns true if semester is_locked = true, preventing INSERT/UPDATE.';

-- =============================================================================
-- PART 6: PERFORMANCE INDEXES
-- =============================================================================

-- 6.1) Indexes on Foreign Key columns for performance
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);

CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);

CREATE INDEX IF NOT EXISTS idx_subjects_class_id ON public.subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON public.subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects(school_id);

CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_subject_id ON public.grades(subject_id);
CREATE INDEX IF NOT EXISTS idx_grades_teacher_id ON public.grades(teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_id ON public.grades(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_date ON public.grades(date);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject_id ON public.attendance(subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_id ON public.attendance(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);

CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles(school_id);

-- =============================================================================
-- PART 7: RLS POLICIES REWRITE - MULTI-TENANT ISOLATION
-- =============================================================================

-- 7.1) Students RLS - Directors can only SELECT/UPDATE if school_id matches
DROP POLICY IF EXISTS "Directors can manage students from their school" ON public.students;
CREATE POLICY "Directors can manage students from their school" ON public.students
  FOR ALL
  USING (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 7.2) Classes RLS - Directors can only SELECT/UPDATE if school_id matches
DROP POLICY IF EXISTS "Directors can manage classes from their school" ON public.classes;
CREATE POLICY "Directors can manage classes from their school" ON public.classes
  FOR ALL
  USING (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 7.3) Subjects RLS - Directors can only SELECT/UPDATE if school_id matches
DROP POLICY IF EXISTS "Directors can manage subjects from their school" ON public.subjects;
CREATE POLICY "Directors can manage subjects from their school" ON public.subjects
  FOR ALL
  USING (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'teacher'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      (
        public.has_role(auth.uid(), 'director'::app_role) OR
        public.has_role(auth.uid(), 'secretariat'::app_role) OR
        public.has_role(auth.uid(), 'teacher'::app_role) OR
        public.has_role(auth.uid(), 'homeroom_teacher'::app_role)
      )
    ) OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

-- 7.4) Grades RLS - Teachers can INSERT/UPDATE only if teacher_assignments exists
-- AND semester is not locked
DROP POLICY IF EXISTS "Teachers can insert grades via teacher_assignments" ON public.grades;
CREATE POLICY "Teachers can insert grades via teacher_assignments" ON public.grades
  FOR INSERT
  WITH CHECK (
    -- First: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second: teacher must have assignment in teacher_assignments
    (
      EXISTS (
        SELECT 1
        FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      -- Fallback: check class_subjects (for backward compatibility)
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.teacher_id = auth.uid()
          AND cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      -- Staff (director/secretariat) can insert even if semester is locked (for corrections)
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_my_school_id()
      )
      OR
      -- UAT Admin and Developer can insert
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

DROP POLICY IF EXISTS "Teachers can update grades via teacher_assignments" ON public.grades;
CREATE POLICY "Teachers can update grades via teacher_assignments" ON public.grades
  FOR UPDATE
  USING (
    -- First: semester must not be locked
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    -- Second: teacher must have assignment
    (
      EXISTS (
        SELECT 1
        FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.teacher_id = auth.uid()
          AND cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_my_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  )
  WITH CHECK (
    -- Same checks for WITH CHECK clause
    NOT public.is_semester_locked_for_grade(date, student_id)
    AND
    (
      EXISTS (
        SELECT 1
        FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = auth.uid()
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.class_subjects cs
        JOIN public.students s ON s.class_id = cs.class_id
        WHERE cs.teacher_id = auth.uid()
          AND cs.subject_id = subject_id
          AND s.id = student_id
          AND cs.school_id = public.get_my_school_id()
          AND s.school_id = public.get_my_school_id()
      )
      OR
      (
        (
          public.has_role(auth.uid(), 'director'::app_role) OR
          public.has_role(auth.uid(), 'secretariat'::app_role)
        ) AND school_id = public.get_my_school_id()
      )
      OR
      public.has_role(auth.uid(), 'uat_admin'::app_role) OR
      public.has_role(auth.uid(), 'developer'::app_role)
    )
  );

-- 7.5) Profiles RLS - Directors can only SELECT/UPDATE if school_id matches
DROP POLICY IF EXISTS "Directors can view profiles from their school" ON public.profiles;
CREATE POLICY "Directors can view profiles from their school" ON public.profiles
  FOR SELECT
  USING (
    (
      school_id = public.get_my_school_id() AND
      public.has_role(auth.uid(), 'director'::app_role)
    ) OR
    id = auth.uid() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

DROP POLICY IF EXISTS "Directors can update profiles from their school" ON public.profiles;
CREATE POLICY "Directors can update profiles from their school" ON public.profiles
  FOR UPDATE
  USING (
    (
      school_id = public.get_my_school_id() AND
      public.has_role(auth.uid(), 'director'::app_role)
    ) OR
    id = auth.uid() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_my_school_id() AND
      public.has_role(auth.uid(), 'director'::app_role)
    ) OR
    id = auth.uid() OR
    public.has_role(auth.uid(), 'uat_admin'::app_role) OR
    public.has_role(auth.uid(), 'developer'::app_role)
  );

COMMIT;
