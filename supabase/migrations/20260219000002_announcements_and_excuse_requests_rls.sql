-- Tabelele announcements și attendance_excuse_requests + RLS
-- announcements: deja există în migrații anterioare - asigură existența
-- attendance_excuse_requests: deja există - actualizează RLS conform cerințelor:
--   - Doar Directorul poate aproba cererile
--   - Elevii pot vedea cererile pe ale lor (pentru absențele lor)

-- =============================================================================
-- 1) ANNOUNCEMENTS (dacă lipsește din vreun mediu)
-- =============================================================================
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

DROP POLICY IF EXISTS "Authenticated can read announcements" ON public.announcements;
CREATE POLICY "Authenticated can read announcements" ON public.announcements
  FOR SELECT USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Staff can publish announcements" ON public.announcements;
CREATE POLICY "Staff can publish announcements" ON public.announcements
  FOR INSERT WITH CHECK (
    created_by = (select auth.uid())
    AND (
      has_role((select auth.uid()), 'director'::public.app_role)
      OR has_role((select auth.uid()), 'secretariat'::public.app_role)
      OR has_role((select auth.uid()), 'uat_admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Staff can update announcements" ON public.announcements;
CREATE POLICY "Staff can update announcements" ON public.announcements
  FOR UPDATE USING (
    created_by = (select auth.uid())
    OR has_role((select auth.uid()), 'director'::public.app_role)
    OR has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR has_role((select auth.uid()), 'uat_admin'::public.app_role)
  )
  WITH CHECK (
    created_by = (select auth.uid())
    OR has_role((select auth.uid()), 'director'::public.app_role)
    OR has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR has_role((select auth.uid()), 'uat_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff can delete announcements" ON public.announcements;
CREATE POLICY "Staff can delete announcements" ON public.announcements
  FOR DELETE USING (
    created_by = (select auth.uid())
    OR has_role((select auth.uid()), 'director'::public.app_role)
    OR has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR has_role((select auth.uid()), 'uat_admin'::public.app_role)
  );

-- =============================================================================
-- 2) ATTENDANCE_EXCUSE_REQUESTS (dacă lipsește)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.attendance_excuse_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.attendance_excuse_requests ENABLE ROW LEVEL SECURITY;

-- Șterge politicile vechi pentru a le recrea conform cerințelor
DROP POLICY IF EXISTS "Users can view own attendance excuse requests" ON public.attendance_excuse_requests;
DROP POLICY IF EXISTS "Users can create attendance excuse requests" ON public.attendance_excuse_requests;
DROP POLICY IF EXISTS "Homeroom can manage excuse requests" ON public.attendance_excuse_requests;
DROP POLICY IF EXISTS "Staff can manage attendance excuse requests" ON public.attendance_excuse_requests;

-- SELECT: Directorul vede toate cererile (pentru panou)
-- Elevii văd cererile pentru absențele lor
-- Părinții văd cererile pentru copiii lor
-- Creatorul (requested_by) vede cererea
DROP POLICY IF EXISTS "Director views all excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Director views all excuse requests" ON public.attendance_excuse_requests
  FOR SELECT USING (has_role((select auth.uid()), 'director'::public.app_role));

CREATE POLICY "Students and parents view own excuse requests" ON public.attendance_excuse_requests
  FOR SELECT USING (
    requested_by = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      WHERE a.id = attendance_id
        AND (
          s.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.parent_student_relations psr
            WHERE psr.parent_user_id = (select auth.uid()) AND psr.student_id = s.id
          )
        )
    )
  );

-- INSERT: Elevii și părinții pot crea cereri pentru absențele elevului
CREATE POLICY "Students and parents create excuse requests" ON public.attendance_excuse_requests
  FOR INSERT WITH CHECK (
    requested_by = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      WHERE a.id = attendance_id
        AND (
          s.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.parent_student_relations psr
            WHERE psr.parent_user_id = (select auth.uid()) AND psr.student_id = s.id
          )
        )
    )
  );

-- UPDATE/DELETE: Doar Directorul poate aproba/respinge cererile
DROP POLICY IF EXISTS "Director approves excuse requests" ON public.attendance_excuse_requests;
CREATE POLICY "Director approves excuse requests" ON public.attendance_excuse_requests
  FOR UPDATE USING (has_role((select auth.uid()), 'director'::public.app_role))
  WITH CHECK (has_role((select auth.uid()), 'director'::public.app_role));
