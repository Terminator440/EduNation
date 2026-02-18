-- Migration: Add school_id to all tables for multi-tenancy support
-- This ensures all data is properly scoped to schools

BEGIN;

-- 1) Add school_id to students table (derived from class)
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Update existing students with school_id from their class
UPDATE public.students s
SET school_id = c.school_id
FROM public.classes c
WHERE s.class_id = c.id AND s.school_id IS NULL;

-- Make school_id NOT NULL after backfilling
ALTER TABLE public.students
ALTER COLUMN school_id SET NOT NULL;

-- 2) Add school_id to subjects table (derived from class)
ALTER TABLE public.subjects 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Update existing subjects with school_id from their class
UPDATE public.subjects s
SET school_id = c.school_id
FROM public.classes c
WHERE s.class_id = c.id AND s.school_id IS NULL;

-- Make school_id NOT NULL after backfilling
ALTER TABLE public.subjects
ALTER COLUMN school_id SET NOT NULL;

-- 3) Add school_id to grades table (derived from student)
ALTER TABLE public.grades 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Update existing grades with school_id from their student
UPDATE public.grades g
SET school_id = s.school_id
FROM public.students s
WHERE g.student_id = s.id AND g.school_id IS NULL;

-- Make school_id NOT NULL after backfilling
ALTER TABLE public.grades
ALTER COLUMN school_id SET NOT NULL;

-- 4) Add school_id to attendance table (derived from student)
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;

-- Update existing attendance with school_id from their student
UPDATE public.attendance a
SET school_id = s.school_id
FROM public.students s
WHERE a.student_id = s.id AND a.school_id IS NULL;

-- Make school_id NOT NULL after backfilling
ALTER TABLE public.attendance
ALTER COLUMN school_id SET NOT NULL;

-- 5) Add is_excused column to attendance for motivated/unmotivated absences
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS is_excused BOOLEAN DEFAULT false;

-- Update existing records: 'motivat' or 'motivated' status means is_excused = true
UPDATE public.attendance
SET is_excused = true
WHERE status IN ('motivat', 'motivated') AND is_excused IS NULL;

-- 6) Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_id ON public.grades(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);

-- 7) Add triggers to automatically set school_id on INSERT
-- For students: derive from class
CREATE OR REPLACE FUNCTION public.set_student_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_student_school_id ON public.students;
CREATE TRIGGER trg_set_student_school_id
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.set_student_school_id();

-- For subjects: derive from class
CREATE OR REPLACE FUNCTION public.set_subject_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_subject_school_id ON public.subjects;
CREATE TRIGGER trg_set_subject_school_id
  BEFORE INSERT OR UPDATE ON public.subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_subject_school_id();

-- For grades: derive from student
CREATE OR REPLACE FUNCTION public.set_grade_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.students
    WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_grade_school_id ON public.grades;
CREATE TRIGGER trg_set_grade_school_id
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.set_grade_school_id();

-- For attendance: derive from student
CREATE OR REPLACE FUNCTION public.set_attendance_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id
    FROM public.students
    WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_attendance_school_id ON public.attendance;
CREATE TRIGGER trg_set_attendance_school_id
  BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attendance_school_id();

COMMIT;
