-- Migration: audit_log_details table + trigger on grades UPDATE
-- Stores old_value/new_value as JSONB and the user who made the change ((select auth.uid()))

BEGIN;

-- 1) Create audit_log_details table
CREATE TABLE IF NOT EXISTS public.audit_log_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log_details IS 'Stores before/after values (JSONB) for audited changes; populated by triggers.';
COMMENT ON COLUMN public.audit_log_details.user_id IS 'User who performed the change (from (select auth.uid())).';
COMMENT ON COLUMN public.audit_log_details.old_value IS 'Row state before UPDATE/DELETE (JSONB).';
COMMENT ON COLUMN public.audit_log_details.new_value IS 'Row state after INSERT/UPDATE (JSONB).';

-- Indexes for filtering and reporting
CREATE INDEX IF NOT EXISTS idx_audit_log_details_user_id ON public.audit_log_details(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_details_entity_type_entity_id ON public.audit_log_details(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_details_created_at ON public.audit_log_details(created_at);

ALTER TABLE public.audit_log_details ENABLE ROW LEVEL SECURITY;

-- RLS: users see only their own audit detail rows; directors/secretariat can see all (optional, align with audit_logs)
DROP POLICY IF EXISTS "Users can view own audit_log_details" ON public.audit_log_details;
CREATE POLICY "Users can view own audit_log_details"
  ON public.audit_log_details FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Directors and secretariat can view all audit_log_details" ON public.audit_log_details;
CREATE POLICY "Directors and secretariat can view all audit_log_details"
  ON public.audit_log_details FOR SELECT
  USING (
    has_role((select auth.uid()), 'director'::app_role) OR
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'uat_admin'::app_role) OR
    has_role((select auth.uid()), 'developer'::app_role)
  );

-- No INSERT/UPDATE/DELETE for normal users; only triggers and service role write
-- (So we don't add WITH CHECK for INSERT – trigger runs as definer)

-- 2) Trigger function: on grades UPDATE, insert one row into audit_log_details
CREATE OR REPLACE FUNCTION public.audit_grades_update_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  -- Only on UPDATE
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  uid := (select auth.uid());

  INSERT INTO public.audit_log_details (user_id, entity_type, entity_id, old_value, new_value)
  VALUES (
    uid,
    TG_TABLE_NAME,
    NEW.id,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

-- 3) Attach trigger to grades (AFTER UPDATE only)
DROP TRIGGER IF EXISTS trg_audit_grades_update_details ON public.grades;
CREATE TRIGGER trg_audit_grades_update_details
  AFTER UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_grades_update_details();

COMMIT;
