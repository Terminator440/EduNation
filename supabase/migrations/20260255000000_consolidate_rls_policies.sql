-- Supabase Linter: Consolidate multiple permissive RLS policies + fix auth_rls_initplan
-- Merge policies per (table, action) to improve performance (one policy evaluated vs many)

-- =============================================================================
-- auth_rls_initplan: Remove redundant "Users can view timetable entries" which
-- uses auth.role() and overlaps with timetable_select_school_scope (school-scoped).
-- Keeping it would allow any authenticated user to view all entries - drop it.
-- =============================================================================
DROP POLICY IF EXISTS "Users can view timetable entries" ON public.timetable_entries;

-- =============================================================================
-- academic_periods: 2 SELECT policies -> 1 SELECT; split manage_director ALL -> INSERT/UPDATE/DELETE
-- =============================================================================
DROP POLICY IF EXISTS "academic_periods_select_school" ON public.academic_periods;
DROP POLICY IF EXISTS "academic_periods_manage_director" ON public.academic_periods;

CREATE POLICY "academic_periods_select" ON public.academic_periods FOR SELECT
  USING (school_id = public.get_user_school_id());

CREATE POLICY "academic_periods_manage" ON public.academic_periods
  FOR INSERT WITH CHECK (
    school_id = public.get_user_school_id()
    AND (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
  );

CREATE POLICY "academic_periods_update" ON public.academic_periods FOR UPDATE
  USING (
    school_id = public.get_user_school_id()
    AND (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
  );

CREATE POLICY "academic_periods_delete" ON public.academic_periods FOR DELETE
  USING (
    school_id = public.get_user_school_id()
    AND (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
  );

-- =============================================================================
-- academic_year_snapshots: 3 SELECT policies -> 1
-- =============================================================================
DROP POLICY IF EXISTS "Staff can view academic_year_snapshots" ON public.academic_year_snapshots;
DROP POLICY IF EXISTS "Parents can view own children snapshots" ON public.academic_year_snapshots;
DROP POLICY IF EXISTS "Students can view own snapshot" ON public.academic_year_snapshots;

CREATE POLICY "academic_year_snapshots_select" ON public.academic_year_snapshots FOR SELECT
  USING (
    (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role) OR public.has_role((select auth.uid()), 'teacher'::public.app_role))
    OR (student_id IN (SELECT psr.student_id FROM public.parent_student_relations psr WHERE psr.parent_user_id = (select auth.uid())))
    OR (student_id IN (SELECT id FROM public.students WHERE user_id = (select auth.uid())))
  );

-- =============================================================================
-- features: 2 SELECT policies -> 1
-- =============================================================================
DROP POLICY IF EXISTS "features_select_all" ON public.features;
DROP POLICY IF EXISTS "features_select_authenticated" ON public.features;

CREATE POLICY "features_select" ON public.features FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

-- =============================================================================
-- attendance_excuse_requests: 2 SELECT policies -> 1
-- =============================================================================
DROP POLICY IF EXISTS "Director views all excuse requests" ON public.attendance_excuse_requests;
DROP POLICY IF EXISTS "Students and parents view own excuse requests" ON public.attendance_excuse_requests;

CREATE POLICY "attendance_excuse_requests_select" ON public.attendance_excuse_requests FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'director'::public.app_role)
    OR requested_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id
      WHERE a.id = attendance_excuse_requests.attendance_id
        AND (s.user_id = (select auth.uid()) OR EXISTS (SELECT 1 FROM public.parent_student_relations psr WHERE psr.parent_user_id = (select auth.uid()) AND psr.student_id = s.id))
    )
  );

-- =============================================================================
-- audit_log_details: 2 SELECT policies -> 1
-- =============================================================================
DROP POLICY IF EXISTS "Users can view own audit_log_details" ON public.audit_log_details;
DROP POLICY IF EXISTS "Directors and secretariat can view all audit_log_details" ON public.audit_log_details;

CREATE POLICY "audit_log_details_select" ON public.audit_log_details FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- =============================================================================
-- disciplinary_actions: 2 SELECT policies -> 1
-- =============================================================================
DROP POLICY IF EXISTS "Parents can view children disciplinary" ON public.disciplinary_actions;
DROP POLICY IF EXISTS "Staff can manage disciplinary_actions" ON public.disciplinary_actions;

CREATE POLICY "disciplinary_actions_select" ON public.disciplinary_actions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.parent_student_relations psr WHERE psr.student_id = disciplinary_actions.student_id AND psr.parent_user_id = (select auth.uid()))
    OR public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
    OR public.has_role((select auth.uid()), 'teacher'::public.app_role)
  );

CREATE POLICY "disciplinary_actions_manage" ON public.disciplinary_actions
  FOR INSERT WITH CHECK (
    public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
    OR public.has_role((select auth.uid()), 'teacher'::public.app_role)
  );

CREATE POLICY "disciplinary_actions_update" ON public.disciplinary_actions FOR UPDATE
  USING (
    public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
    OR public.has_role((select auth.uid()), 'teacher'::public.app_role)
  );

CREATE POLICY "disciplinary_actions_delete" ON public.disciplinary_actions FOR DELETE
  USING (
    public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
    OR public.has_role((select auth.uid()), 'teacher'::public.app_role)
  );

-- =============================================================================
-- parent_student_relations: 2 policies (SELECT + ALL) -> 1 SELECT, split ALL to INSERT/UPDATE/DELETE
-- =============================================================================
DROP POLICY IF EXISTS "Parents can view their relations" ON public.parent_student_relations;
DROP POLICY IF EXISTS "Secretariat can manage relations" ON public.parent_student_relations;

CREATE POLICY "parent_student_relations_select" ON public.parent_student_relations FOR SELECT
  USING (
    parent_user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'director'::public.app_role)
  );

CREATE POLICY "parent_student_relations_manage" ON public.parent_student_relations
  FOR INSERT WITH CHECK (public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR public.has_role((select auth.uid()), 'director'::public.app_role));

CREATE POLICY "parent_student_relations_update" ON public.parent_student_relations FOR UPDATE
  USING (public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR public.has_role((select auth.uid()), 'director'::public.app_role));

CREATE POLICY "parent_student_relations_delete" ON public.parent_student_relations FOR DELETE
  USING (public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR public.has_role((select auth.uid()), 'director'::public.app_role));

-- =============================================================================
-- student_activations: 2 SELECT policies -> 1; split Staff ALL -> INSERT/UPDATE/DELETE
-- =============================================================================
DROP POLICY IF EXISTS "Anyone can view unused activations for validation" ON public.student_activations;
DROP POLICY IF EXISTS "Staff can manage activations" ON public.student_activations;

CREATE POLICY "student_activations_select" ON public.student_activations FOR SELECT
  USING (
    (is_used = false AND expires_at > now())
    OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
  );

CREATE POLICY "student_activations_manage" ON public.student_activations
  FOR INSERT WITH CHECK (
    public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
  );

CREATE POLICY "student_activations_update" ON public.student_activations FOR UPDATE
  USING (
    public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
  );

CREATE POLICY "student_activations_delete" ON public.student_activations FOR DELETE
  USING (
    public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
  );
