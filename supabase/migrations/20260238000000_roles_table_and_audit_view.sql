-- =============================================================================
-- Tabel roles (referință pentru app_role) + view audit cu old_value/new_value
-- =============================================================================

BEGIN;

-- 1) Tabel roles: id, code (unic, aliniat cu app_role), display_name
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.roles IS 'Referință roluri (RBAC); code = app_role enum value.';

INSERT INTO public.roles (code, display_name) VALUES
  ('student', 'Elev'),
  ('parent', 'Părinte'),
  ('teacher', 'Profesor'),
  ('homeroom_teacher', 'Diriginte'),
  ('secretariat', 'Secretariat'),
  ('director', 'Director'),
  ('uat_admin', 'Administrator UAT'),
  ('developer', 'Dezvoltator')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select_all" ON public.roles;
CREATE POLICY "roles_select_all" ON public.roles FOR SELECT USING (true);

-- 2) View audit_logs_export: alias old_data -> old_value, new_data -> new_value (compatibilitate API)
CREATE OR REPLACE VIEW public.audit_logs_export AS
SELECT
  id,
  user_id,
  action,
  entity_type,
  entity_id,
  old_data AS old_value,
  new_data AS new_value,
  details,
  school_id,
  user_name,
  active_role,
  created_at
FROM public.audit_logs;

COMMENT ON VIEW public.audit_logs_export IS 'Audit log cu coloane old_value/new_value (alias pentru old_data/new_data).';

COMMIT;
