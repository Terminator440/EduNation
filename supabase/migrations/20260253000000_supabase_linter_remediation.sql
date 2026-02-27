-- Supabase Performance & Security Linter remediation
-- Addresses: RLS disabled, unindexed FKs, function search_path, security_definer views

-- =============================================================================
-- 1. ENABLE RLS ON school_years
-- =============================================================================
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_years_select" ON public.school_years;
CREATE POLICY "school_years_select" ON public.school_years
  FOR SELECT USING (
    school_id IS NULL AND (public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
    OR
    (school_id IS NOT NULL AND public.get_user_school_id() = school_id)
  );

DROP POLICY IF EXISTS "school_years_insert" ON public.school_years;
CREATE POLICY "school_years_insert" ON public.school_years
  FOR INSERT WITH CHECK (
    (public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
    OR
    (school_id IS NOT NULL AND public.get_user_school_id() = school_id AND (
      public.has_role((select auth.uid()), 'director'::public.app_role) OR
      public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    ))
  );

DROP POLICY IF EXISTS "school_years_update" ON public.school_years;
CREATE POLICY "school_years_update" ON public.school_years
  FOR UPDATE USING (
    school_id IS NULL AND (public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
    OR
    (school_id IS NOT NULL AND public.get_user_school_id() = school_id AND (
      public.has_role((select auth.uid()), 'director'::public.app_role) OR
      public.has_role((select auth.uid()), 'secretariat'::public.app_role)
    ))
  );

DROP POLICY IF EXISTS "school_years_delete" ON public.school_years;
CREATE POLICY "school_years_delete" ON public.school_years
  FOR DELETE USING (
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role)
    OR
    (school_id IS NOT NULL AND public.get_user_school_id() = school_id AND public.has_role((select auth.uid()), 'director'::public.app_role))
  );

-- =============================================================================
-- 2. ADD INDEXES FOR UNINDEXED FOREIGN KEYS (performance)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_academic_year_closed_by ON public.academic_year(closed_by);
CREATE INDEX IF NOT EXISTS idx_academic_year_snapshots_student_id ON public.academic_year_snapshots(student_id);
CREATE INDEX IF NOT EXISTS idx_academic_year_snapshots_subject_id ON public.academic_year_snapshots(subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_created_by ON public.attendance(created_by);
CREATE INDEX IF NOT EXISTS idx_attendance_deleted_by ON public.attendance(deleted_by);
CREATE INDEX IF NOT EXISTS idx_attendance_excused_by ON public.attendance(excused_by);
CREATE INDEX IF NOT EXISTS idx_attendance_validated_by ON public.attendance(validated_by);
CREATE INDEX IF NOT EXISTS idx_attendance_excuse_requests_attendance_id ON public.attendance_excuse_requests(attendance_id);
CREATE INDEX IF NOT EXISTS idx_attendance_excuse_requests_decided_by ON public.attendance_excuse_requests(decided_by);
CREATE INDEX IF NOT EXISTS idx_attendance_excuse_requests_requested_by ON public.attendance_excuse_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_disciplinary_actions_created_by ON public.disciplinary_actions(created_by);
CREATE INDEX IF NOT EXISTS idx_disciplinary_actions_student_id ON public.disciplinary_actions(student_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_calculated_by ON public.final_grades(calculated_by);
CREATE INDEX IF NOT EXISTS idx_grade_change_requests_decided_by ON public.grade_change_requests(decided_by);
CREATE INDEX IF NOT EXISTS idx_grade_change_requests_grade_id ON public.grade_change_requests(grade_id);
CREATE INDEX IF NOT EXISTS idx_grade_change_requests_requested_by ON public.grade_change_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_grades_corrected_from ON public.grades(corrected_from);
CREATE INDEX IF NOT EXISTS idx_grades_created_by ON public.grades(created_by);
CREATE INDEX IF NOT EXISTS idx_grades_deleted_by ON public.grades(deleted_by);
CREATE INDEX IF NOT EXISTS idx_grades_updated_by ON public.grades(updated_by);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON public.invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_invitations_student_id ON public.invitations(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_class_id ON public.lessons(class_id);
CREATE INDEX IF NOT EXISTS idx_lessons_created_by ON public.lessons(created_by);
CREATE INDEX IF NOT EXISTS idx_lessons_subject_id ON public.lessons(subject_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_relations_student_id ON public.parent_student_relations(student_id);
CREATE INDEX IF NOT EXISTS idx_school_events_created_by ON public.school_events(created_by);
CREATE INDEX IF NOT EXISTS idx_semesters_locked_by ON public.semesters(locked_by);
CREATE INDEX IF NOT EXISTS idx_student_activations_student_id ON public.student_activations(student_id);
CREATE INDEX IF NOT EXISTS idx_student_activations_used_by ON public.student_activations(used_by);
CREATE INDEX IF NOT EXISTS idx_teacher_register_signed_by ON public.teacher_register(signed_by);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_subject_id ON public.timetable_entries(subject_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_school_id ON public.user_roles(school_id);

-- =============================================================================
-- 3. FIX FUNCTION search_path (security: prevent search_path injection)
-- =============================================================================
ALTER FUNCTION public.profile_role_rank(public.app_role) SET search_path = public;
ALTER FUNCTION public.set_attendance_school_id() SET search_path = public;
ALTER FUNCTION public.set_class_subject_school_id() SET search_path = public;
ALTER FUNCTION public.get_semester_from_date(date) SET search_path = public;
ALTER FUNCTION public.set_student_school_id() SET search_path = public;
ALTER FUNCTION public.set_subject_school_id() SET search_path = public;
ALTER FUNCTION public.set_grade_school_id() SET search_path = public;
ALTER FUNCTION public.update_semesters_updated_at() SET search_path = public;
ALTER FUNCTION public.get_academic_year_from_date(date) SET search_path = public;
ALTER FUNCTION public.update_final_grades_updated_at() SET search_path = public;
ALTER FUNCTION public.check_only_homeroom_can_excuse() SET search_path = public;
ALTER FUNCTION public.set_tickets_updated_at() SET search_path = public;
ALTER FUNCTION public.set_teacher_assignment_school_id() SET search_path = public;
ALTER FUNCTION public.round_final_grade_ro(numeric) SET search_path = public;
ALTER FUNCTION public.trg_grades_check_semester_lock() SET search_path = public;
ALTER FUNCTION public.trg_attendance_check_semester_lock() SET search_path = public;
ALTER FUNCTION public.trg_grades_validate_teacher_and_curriculum() SET search_path = public;
ALTER FUNCTION public.audit_summary_grades(text, text, numeric, numeric, date, date, uuid) SET search_path = public;
ALTER FUNCTION public.jsonb_diff(jsonb, jsonb) SET search_path = public;
ALTER FUNCTION public.trg_grades_one_normal_per_day() SET search_path = public;
ALTER FUNCTION public.check_semester_not_locked_for_grade() SET search_path = public;

-- =============================================================================
-- 4. SECURITY DEFINER VIEWS → security_invoker where safe
-- profiles_safe intentionally uses DEFINER to filter by get_user_school_id()
-- and allow teachers to see colleagues; keep as-is.
-- view_student_* and audit_logs_export: use invoker so RLS on underlying tables applies.
-- =============================================================================
ALTER VIEW public.view_student_subject_average SET (security_invoker = true);
ALTER VIEW public.view_student_general_average SET (security_invoker = true);
ALTER VIEW public.audit_logs_export SET (security_invoker = true);
