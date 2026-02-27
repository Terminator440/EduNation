-- System Health: app_settings for maintenance mode and RPC for recent errors.
-- Access: only uat_admin and developer can read/write app_settings and call error RPC.

-- 1) app_settings key-value store (maintenance_mode, etc.)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only uat_admin and developer can manage app_settings" ON public.app_settings;
CREATE POLICY "Only uat_admin and developer can manage app_settings"
  ON public.app_settings
  FOR ALL
  USING (
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- Seed default: maintenance_mode off
INSERT INTO public.app_settings (key, value)
VALUES ('maintenance_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) RPC: get maintenance mode (callable by uat_admin/developer; others get false)
CREATE OR REPLACE FUNCTION public.get_maintenance_mode()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (select auth.uid());
  v_val BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  IF NOT (public.has_role(v_uid, 'uat_admin'::app_role) OR public.has_role(v_uid, 'developer'::app_role)) THEN
    -- Non-admin: still return actual value so frontend can show maintenance page
    SELECT (value = true OR value = 'true') INTO v_val
    FROM public.app_settings
    WHERE key = 'maintenance_mode'
    LIMIT 1;
    RETURN COALESCE(v_val, false);
  END IF;
  SELECT (value = true OR value = 'true') INTO v_val
  FROM public.app_settings
  WHERE key = 'maintenance_mode'
  LIMIT 1;
  RETURN COALESCE(v_val, false);
END;
$$;

-- 3) RPC: set maintenance mode (only uat_admin/developer)
CREATE OR REPLACE FUNCTION public.set_maintenance_mode(enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (select auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (public.has_role(v_uid, 'uat_admin'::app_role) OR public.has_role(v_uid, 'developer'::app_role)) THEN
    RAISE EXCEPTION 'Only admins and developers can change maintenance mode';
  END IF;
  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES ('maintenance_mode', to_jsonb(enabled), now())
  ON CONFLICT (key) DO UPDATE SET value = to_jsonb(enabled), updated_at = now();
END;
$$;

-- 4) RPC: last 10 frontend errors from audit_logs (only uat_admin/developer can call)
CREATE OR REPLACE FUNCTION public.get_system_recent_errors()
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  message TEXT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (select auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'uat_admin'::app_role) OR public.has_role(v_uid, 'developer'::app_role)) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    a.id,
    a.created_at,
    a.user_name,
    COALESCE((a.details->>'message')::TEXT, a.action) AS message,
    a.details
  FROM public.audit_logs a
  WHERE a.action = 'error.frontend'
  ORDER BY a.created_at DESC NULLS LAST
  LIMIT 10;
END;
$$;

COMMENT ON TABLE public.app_settings IS 'System settings (e.g. maintenance_mode). Only uat_admin and developer can read/write.';
