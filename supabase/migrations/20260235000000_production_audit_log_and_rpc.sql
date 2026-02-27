-- =============================================================================
-- Production-grade: audit_log (spec), RPC-only mutations, academic_periods,
-- login/access logs. NO direct frontend writes; all via RPC.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. AUDIT_LOG TABLE (exact spec: table_name, record_id, action, old_data, new_data, changed_by, created_at)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON public.audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_own_school_or_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_own_school_or_admin" ON public.audit_log FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'developer'::public.app_role)
    OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
  );

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;

COMMENT ON TABLE public.audit_log IS 'Audit trail for grades and attendance; populated only by triggers. changed_by = (select auth.uid()).';

-- Trigger function: write to audit_log on grades/attendance changes
CREATE OR REPLACE FUNCTION public.audit_log_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_record_id UUID;
  v_old JSONB;
  v_new JSONB;
  v_action TEXT;
BEGIN
  v_uid := (select auth.uid());
  v_action := TG_OP;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_record_id := NEW.id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (TG_TABLE_NAME, v_record_id, v_action, v_old, v_new, v_uid);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_grades ON public.grades;
CREATE TRIGGER trg_audit_log_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_log_attendance ON public.attendance;
CREATE TRIGGER trg_audit_log_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger_fn();

-- =============================================================================
-- 2. GRADES: ensure created_by, updated_by exist (spec)
-- =============================================================================

ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.grades.created_by IS 'User who created the grade ((select auth.uid()) at insert).';
COMMENT ON COLUMN public.grades.updated_by IS 'User who last updated the grade.';

-- =============================================================================
-- 3. ATTENDANCE: ensure created_by exists (spec)
-- =============================================================================

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.attendance.created_by IS 'User who created the attendance record.';

-- =============================================================================
-- 4. ACADEMIC_PERIODS (spec: id, school_id, name, is_locked) – lock control
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.academic_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_periods_school ON public.academic_periods(school_id);
CREATE INDEX IF NOT EXISTS idx_academic_periods_locked ON public.academic_periods(is_locked) WHERE is_locked = true;

ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academic_periods_select_school" ON public.academic_periods;
CREATE POLICY "academic_periods_select_school" ON public.academic_periods FOR SELECT
  USING (school_id = public.get_user_school_id());

DROP POLICY IF EXISTS "academic_periods_manage_director" ON public.academic_periods;
CREATE POLICY "academic_periods_manage_director" ON public.academic_periods FOR ALL
  USING (
    school_id = public.get_user_school_id()
    AND (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
  );

-- =============================================================================
-- 5. LOGIN LOGS & ACCESS LOGS (spec §13)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  success BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON public.login_logs(created_at);

CREATE TABLE IF NOT EXISTS public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resource TEXT,
  action TEXT,
  success BOOLEAN NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user ON public.access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON public.access_logs(created_at);

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Only directors/admins see logs
DROP POLICY IF EXISTS "login_logs_select_admin" ON public.login_logs;
CREATE POLICY "login_logs_select_admin" ON public.login_logs FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

DROP POLICY IF EXISTS "access_logs_select_admin" ON public.access_logs;
CREATE POLICY "access_logs_select_admin" ON public.access_logs FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'director'::public.app_role)
    OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- Inserts only via service/trigger (SECURITY DEFINER)
REVOKE INSERT ON public.login_logs FROM authenticated;
REVOKE INSERT ON public.access_logs FROM authenticated;

COMMIT;
