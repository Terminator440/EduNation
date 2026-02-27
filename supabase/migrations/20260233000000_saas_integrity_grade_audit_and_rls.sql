-- =============================================================================
-- SaaS Integrity: Grade Audit, Multi-Role, Semester Lock Bypass, RLS Hardening
--
-- Pilon 1 – Arhitectură Multi-Rol & Securitate
-- - Rolurile sunt o colecție în DB (user_roles). Permisiunile se verifică în
--   backend/RLS; Role Switcher în UI schimbă doar perspectiva ('View as').
-- - RLS: orice acțiune verifică (select auth.uid()), school_id, rol din user_roles și
--   (pentru profesori) asignarea la clasă/materie (teacher_assignments).
--
-- Pilon 2 – Integritate Date & Audit
-- - Tabel grade_audit: old_value, new_value, user_id, timestamp. Imutabilitate
--   prioritate zero; triggere AFTER INSERT/UPDATE/DELETE pe grades.
-- - Semestru închis (is_locked): RLS blochează modificări note/absențe, cu
--   excepția Admin-ului suprem (developer / uat_admin).
--
-- Pilon 3 – Model de domeniu (referință)
-- - School -> Class -> Student; Teacher -> Subject -> Class (teacher_assignments).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. TABEL grade_audit ȘI TRIGGERE PE grades
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.grade_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_value JSONB,
  new_value JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.grade_audit IS 'Audit dedicat note: old_value, new_value, user_id, timestamp. Imutabilitate date oficiale.';
COMMENT ON COLUMN public.grade_audit.old_value IS 'Stare înainte (UPDATE/DELETE).';
COMMENT ON COLUMN public.grade_audit.new_value IS 'Stare după (INSERT/UPDATE).';

CREATE INDEX IF NOT EXISTS idx_grade_audit_grade_id ON public.grade_audit(grade_id);
CREATE INDEX IF NOT EXISTS idx_grade_audit_school_id ON public.grade_audit(school_id);
CREATE INDEX IF NOT EXISTS idx_grade_audit_created_at ON public.grade_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_grade_audit_user_id ON public.grade_audit(user_id);

ALTER TABLE public.grade_audit ENABLE ROW LEVEL SECURITY;

-- RLS: citire doar în școala utilizatorului sau admin suprem
DROP POLICY IF EXISTS "grade_audit_select_own_school_or_supreme" ON public.grade_audit;
CREATE POLICY "grade_audit_select_own_school_or_supreme" ON public.grade_audit
  FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- Inserări doar din trigger (SECURITY DEFINER); nu permitem INSERT direct din aplicație
-- Revocăm INSERT pentru role authenticated pe grade_audit (doar trigger scrie)
REVOKE INSERT ON public.grade_audit FROM authenticated;
GRANT SELECT ON public.grade_audit TO authenticated;

-- Trigger function: scrie în grade_audit la fiecare INSERT/UPDATE/DELETE pe grades
CREATE OR REPLACE FUNCTION public.grade_audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_school_id UUID;
  v_grade_id UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  v_uid := (select auth.uid());
  v_grade_id := COALESCE(NEW.id, OLD.id);
  v_school_id := (COALESCE(to_jsonb(NEW), to_jsonb(OLD))->>'school_id')::uuid;

  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  INSERT INTO public.grade_audit (grade_id, action, old_value, new_value, user_id, school_id)
  VALUES (v_grade_id, TG_OP, v_old, v_new, v_uid, v_school_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger AFTER pe grades (rulează în plus față de orice audit existent pe audit_logs)
DROP TRIGGER IF EXISTS trg_grade_audit ON public.grades;
CREATE TRIGGER trg_grade_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.grade_audit_trigger_fn();

COMMENT ON FUNCTION public.grade_audit_trigger_fn IS 'Scrie în grade_audit la fiecare INSERT/UPDATE/DELETE pe grades.';

-- =============================================================================
-- 2. BYPASS SEMESTER LOCK PENTRU ADMIN SUPREM
-- =============================================================================

-- Funcție: utilizatorul este "Admin suprem" (poate modifica note și cu semestrul blocat)
CREATE OR REPLACE FUNCTION public.is_supreme_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(p_user_id, 'developer'::public.app_role)
     OR public.has_role(p_user_id, 'uat_admin'::public.app_role);
$$;

COMMENT ON FUNCTION public.is_supreme_admin IS 'True pentru developer/uat_admin; pot modifica note/absențe și când semestrul e închis.';

-- Rescriem politicile grades: dacă e supreme admin, poate scrie chiar dacă semestrul e blocat
DROP POLICY IF EXISTS "grades_insert_strict" ON public.grades;
CREATE POLICY "grades_insert_strict" ON public.grades
  FOR INSERT
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (
      public.is_supreme_admin((select auth.uid()))
      OR (
        NOT public.is_semester_locked_for_grade(date, student_id)
        AND (
          public.user_can_edit_grade((select auth.uid()), student_id, subject_id, school_id)
        )
      )
    )
  );

DROP POLICY IF EXISTS "grades_update_strict" ON public.grades;
CREATE POLICY "grades_update_strict" ON public.grades
  FOR UPDATE
  USING (
    school_id = public.get_user_school_id()
    AND (
      public.is_supreme_admin((select auth.uid()))
      OR (
        NOT public.is_semester_locked_for_grade(date, student_id)
        AND (
          public.user_can_edit_grade((select auth.uid()), student_id, subject_id, school_id)
        )
      )
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id()
    AND (
      public.is_supreme_admin((select auth.uid()))
      OR (
        NOT public.is_semester_locked_for_grade(date, student_id)
        AND (
          public.user_can_edit_grade((select auth.uid()), student_id, subject_id, school_id)
        )
      )
    )
  );

-- =============================================================================
-- 3. MULTI-ROL: COlecție roluri din DB (user_roles) pentru UI "View as"
-- =============================================================================

-- Returnează lista de roluri a utilizatorului (pentru Context Switcher / View as)
CREATE OR REPLACE FUNCTION public.get_user_role_list(p_user_id UUID DEFAULT auth.uid())
RETURNS SETOF public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = p_user_id;
$$;

COMMENT ON FUNCTION public.get_user_role_list IS 'Rolurile utilizatorului din user_roles (multi-rol). UI folosește pentru View as; permisiunile se verifică în RLS cu has_role().';

GRANT EXECUTE ON FUNCTION public.get_user_role_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supreme_admin TO authenticated;

COMMIT;
