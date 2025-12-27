-- Announcements (Anunțuri) for EduNation

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  target_role public.app_role,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_target_role ON public.announcements (target_role);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read announcements (target_role is filtered by the app; RLS keeps it simple).
DROP POLICY IF EXISTS "Authenticated can read announcements" ON public.announcements;
CREATE POLICY "Authenticated can read announcements" ON public.announcements
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Staff can publish announcements.
DROP POLICY IF EXISTS "Staff can publish announcements" ON public.announcements;
CREATE POLICY "Staff can publish announcements" ON public.announcements
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND (
      has_role(auth.uid(), 'director'::app_role)
      OR has_role(auth.uid(), 'secretariat'::app_role)
      OR has_role(auth.uid(), 'uat_admin'::app_role)
    )
  );

-- Staff (or creator) can update/delete.
DROP POLICY IF EXISTS "Staff can update announcements" ON public.announcements;
CREATE POLICY "Staff can update announcements" ON public.announcements
  FOR UPDATE USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'uat_admin'::app_role)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

DROP POLICY IF EXISTS "Staff can delete announcements" ON public.announcements;
CREATE POLICY "Staff can delete announcements" ON public.announcements
  FOR DELETE USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'director'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

COMMIT;
