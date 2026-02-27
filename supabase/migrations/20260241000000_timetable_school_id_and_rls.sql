-- Add school_id to timetable_entries for multi-tenant RLS (scope by school).
-- Backfill from classes; new rows must set school_id (via class or explicit).

ALTER TABLE public.timetable_entries
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

-- Backfill from class_id -> classes.school_id
UPDATE public.timetable_entries te
SET school_id = c.school_id
FROM public.classes c
WHERE te.class_id = c.id AND te.school_id IS NULL;

-- Allow NULL for legacy; new inserts should set school_id (trigger or app).
CREATE INDEX IF NOT EXISTS idx_timetable_entries_school_id ON public.timetable_entries(school_id);

-- RLS: replace "Anyone can view" with school-scoped for non-developer.
DROP POLICY IF EXISTS "Anyone can view timetable" ON public.timetable_entries;

CREATE POLICY "timetable_select_school_scope"
  ON public.timetable_entries
  FOR SELECT
  USING (
    school_id IS NOT NULL
    AND (
      school_id IN (SELECT school_id FROM public.profiles WHERE id = (select auth.uid()) AND school_id IS NOT NULL)
      OR has_role((select auth.uid()), 'uat_admin'::app_role)
      OR has_role((select auth.uid()), 'developer'::app_role)
    )
  );

-- Allow viewing rows with NULL school_id only for developer (legacy)
CREATE POLICY "timetable_select_legacy_developer"
  ON public.timetable_entries
  FOR SELECT
  USING (school_id IS NULL AND has_role((select auth.uid()), 'developer'::app_role));

-- Staff manage only their school's entries
DROP POLICY IF EXISTS "Staff can manage all timetable entries" ON public.timetable_entries;
CREATE POLICY "timetable_staff_manage_school"
  ON public.timetable_entries
  FOR ALL
  USING (
    (has_role((select auth.uid()), 'secretariat'::app_role) OR has_role((select auth.uid()), 'director'::app_role))
    AND (
      school_id IN (SELECT school_id FROM public.profiles WHERE id = (select auth.uid()))
      OR has_role((select auth.uid()), 'uat_admin'::app_role)
    )
  );

-- Teachers manage own entries (unchanged but ensure school scope in app)
-- "Teachers can manage own timetable entries" remains: teacher_id = (select auth.uid())

COMMENT ON COLUMN public.timetable_entries.school_id IS 'School scope for multi-tenant RLS; backfilled from class.';
