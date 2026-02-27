
-- Create teacher_register table (condica)
CREATE TABLE IF NOT EXISTS public.teacher_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_entry_id uuid NOT NULL REFERENCES public.timetable_entries(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id),
  subject_id uuid REFERENCES public.subjects(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  signed_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(timetable_entry_id, teacher_id, date)
);

-- Enable RLS
ALTER TABLE public.teacher_register ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own register entries (signed_by matches 20251222 schema)
DROP POLICY IF EXISTS "Teachers can view own register entries" ON public.teacher_register;
CREATE POLICY "Teachers can view own register entries"
ON public.teacher_register
FOR SELECT
USING (signed_by = auth.uid());

-- Teachers can insert their own register entries
DROP POLICY IF EXISTS "Teachers can sign register" ON public.teacher_register;
CREATE POLICY "Teachers can sign register"
ON public.teacher_register
FOR INSERT
WITH CHECK (
  signed_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.timetable_entries te
    WHERE te.id = timetable_entry_id AND te.teacher_id = auth.uid()
  )
);

-- Directors can view all register entries (school oversight)
DROP POLICY IF EXISTS "Directors can view all register entries" ON public.teacher_register;
CREATE POLICY "Directors can view all register entries"
ON public.teacher_register
FOR SELECT
USING (
  has_role(auth.uid(), 'director'::app_role) OR 
  has_role(auth.uid(), 'secretariat'::app_role)
);

-- Developers can view all register entries
DROP POLICY IF EXISTS "Developers can view all register entries" ON public.teacher_register;
CREATE POLICY "Developers can view all register entries"
ON public.teacher_register
FOR SELECT
USING (has_role(auth.uid(), 'developer'::app_role));

-- Add unique constraint on attendance for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_student_subject_date_unique'
  ) THEN
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_subject_date_unique 
    UNIQUE (student_id, subject_id, date);
  END IF;
END $$;
