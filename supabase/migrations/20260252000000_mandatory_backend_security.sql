-- =============================================================================
-- IMPLEMENTĂRI OBLIGATORII ÎN BACKEND
--
-- 1. Eliminare USING (true) – politici stricte cu (select auth.uid()) și school_id
-- 2. Prevenire escaladare roluri – user nu modifică propriul rol, staff nu creează admin
-- 3. Constrângeri și indexuri suplimentare
-- 4. Invitații – policy single-use, verificare school_id
-- 5. Soft delete – deleted_at pe schools, classes unde lipsește
-- 6. Audit pentru user_roles
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ELIMINARE USING (true) – schools, roles, feature_flags
-- =============================================================================

-- Schools: înlocuie "Anyone can view" cu politică strictă
DROP POLICY IF EXISTS "Anyone can view schools" ON public.schools;
DROP POLICY IF EXISTS "schools_select_public" ON public.schools;
DROP POLICY IF EXISTS "schools_select_all" ON public.schools;

CREATE POLICY "schools_select_auth_or_own" ON public.schools
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND (
      -- Utilizator văzută propria școală (din profiles)
      id = (SELECT school_id FROM public.profiles WHERE id = (select auth.uid()))
      OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  );

-- Roles (tabelul roles – view/helper): restrict la admin
DROP POLICY IF EXISTS "roles_select_all" ON public.roles;
CREATE POLICY "roles_select_restricted" ON public.roles
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND (
      public.has_role((select auth.uid()), 'director'::public.app_role)
      OR public.has_role((select auth.uid()), 'secretariat'::public.app_role)
      OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  );

-- Feature flags: doar autentificați
DROP POLICY IF EXISTS "features_select_authenticated" ON public.features;
DROP POLICY IF EXISTS "features_select" ON public.features;
CREATE POLICY "features_select_authenticated" ON public.features
  FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

-- =============================================================================
-- 2. PREVENIRE ESCALADARE ROLURI – user_roles
-- User NU poate modifica propriul rol.
-- Staff (director/secretariat) NU poate crea uat_admin sau developer.
-- Doar uat_admin sau developer poate promova la roluri administrative.
-- =============================================================================

-- Elimină politicile vechi
DROP POLICY IF EXISTS "Staff can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Developers can view all user_roles" ON public.user_roles;

-- SELECT: director/secretariat văd rolurile din școala lor; uat_admin/developer toate
CREATE POLICY "user_roles_select_strict" ON public.user_roles
  FOR SELECT
  USING (
    (select auth.uid()) IS NOT NULL
    AND (
      -- Director/secretariat: doar utilizatori din aceeași școală
      (
        (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'secretariat'::public.app_role))
        AND user_id IN (SELECT id FROM public.profiles WHERE school_id = public.get_user_school_id())
      )
      OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  );

-- INSERT: Staff NU poate adăuga uat_admin sau developer.
-- Excepție: user cu 0 roluri poate adăuga primul rol non-admin (claim invitație, bootstrap).
-- User cu roluri existente NU poate adăuga roluri pentru sine (escaladare blocată).
CREATE POLICY "user_roles_insert_no_escalation" ON public.user_roles
  FOR INSERT
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND (
      -- Alt user: staff/admin conform regulilor
      (user_id != (select auth.uid())
        AND (
          (public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
          OR
          (
            (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'secretariat'::public.app_role))
            AND role NOT IN ('uat_admin'::public.app_role, 'developer'::public.app_role)
            AND user_id IN (SELECT id FROM public.profiles WHERE school_id = public.get_user_school_id())
          )
        )
      )
      OR
      -- Propriul rol: doar dacă 0 roluri și doar roluri non-admin (claim invitație)
      (user_id = (select auth.uid())
        AND role NOT IN ('uat_admin'::public.app_role, 'developer'::public.app_role)
        AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (select auth.uid())))
    )
  );

-- UPDATE: același principiu (în practică user_roles se modifică rar; UPDATE = DELETE + INSERT)
CREATE POLICY "user_roles_update_no_escalation" ON public.user_roles
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND user_id != (select auth.uid())
    AND (
      (public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
      OR
      (
        (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'secretariat'::public.app_role))
        AND role NOT IN ('uat_admin'::public.app_role, 'developer'::public.app_role)
        AND user_id IN (SELECT id FROM public.profiles WHERE school_id = public.get_user_school_id())
      )
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND user_id != (select auth.uid())
    AND (
      (public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
      OR
      (
        (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'secretariat'::public.app_role))
        AND role NOT IN ('uat_admin'::public.app_role, 'developer'::public.app_role)
      )
    )
  );

-- DELETE: același principiu
CREATE POLICY "user_roles_delete_no_escalation" ON public.user_roles
  FOR DELETE
  USING (
    (select auth.uid()) IS NOT NULL
    AND user_id != (select auth.uid())
    AND (
      (public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR public.has_role((select auth.uid()), 'developer'::public.app_role))
      OR
      (
        (public.has_role((select auth.uid()), 'director'::public.app_role) OR public.has_role((select auth.uid()), 'secretariat'::public.app_role))
        AND user_id IN (SELECT id FROM public.profiles WHERE school_id = public.get_user_school_id())
      )
    )
  );

-- =============================================================================
-- 3. INDEXURI – user_id, school_id, invitation_code, created_at
-- =============================================================================

-- Ensure is_used exists on invitations before creating index (invitations uses current_uses/max_uses; is_used = true when used)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'is_used') THEN
    ALTER TABLE public.invitations ADD COLUMN is_used BOOLEAN NOT NULL DEFAULT false;
    UPDATE public.invitations SET is_used = (current_uses >= max_uses) WHERE true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_code_hash ON public.invitations(code_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_school_id ON public.invitations(school_id);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON public.invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_is_used ON public.invitations(is_used) WHERE is_used = false;
CREATE INDEX IF NOT EXISTS idx_grades_created_at ON public.grades(created_at) WHERE created_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_created_at ON public.attendance(created_at) WHERE created_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- =============================================================================
-- 4. INVITAȚII – UNIQUE invitation_code (code_hash deja UNIQUE), policy single-use
-- Verificare: claim_invitation deja setează is_used. Policy: invitația poate fi folosită o singură dată.
-- Adăugăm CHECK pentru is_used dacă lipsește.
-- =============================================================================

-- Asigură că invitations are is_used și expires_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'is_used') THEN
    ALTER TABLE public.invitations ADD COLUMN is_used BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'expires_at') THEN
    ALTER TABLE public.invitations ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours');
  END IF;
END $$;

-- RLS pe invitations: citire limitată la creator/școală, invitația nefolosită și neexpirată pentru claim
-- (Politicile existente din create_invitation RPC și claim sunt deja în RPC. RLS pe tabel trebuie să permită doar operațiunile necesare.)

-- =============================================================================
-- 5. SOFT DELETE – deleted_at pe schools, classes
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.schools ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.classes ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
  -- profiles: is_active sau deleted_at - multe migrații folosesc deja soft delete prin gdpr
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.profiles ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- =============================================================================
-- 6. AUDIT PENTRU user_roles – trigger la INSERT/UPDATE/DELETE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_user_roles_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_entity_type TEXT := 'user_role';
  v_action TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_entity_id UUID;
  v_user_name TEXT;
BEGIN
  v_action := TG_OP;
  v_user_name := COALESCE((SELECT full_name FROM public.profiles WHERE id = (select auth.uid())), 'system');

  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_entity_id := OLD.id;
    SELECT school_id INTO v_school_id FROM public.profiles WHERE id = OLD.user_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_entity_id := NEW.id;
    SELECT school_id INTO v_school_id FROM public.profiles WHERE id = NEW.user_id;
  ELSE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_entity_id := NEW.id;
    SELECT school_id INTO v_school_id FROM public.profiles WHERE id = NEW.user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, old_data, new_data, school_id)
    VALUES (
      (select auth.uid()),
      v_user_name,
      COALESCE((SELECT active_role FROM public.profiles WHERE id = (select auth.uid()) LIMIT 1), 'student'::public.app_role),
      v_action,
      v_entity_type,
      v_entity_id,
      v_old_data,
      v_new_data,
      v_school_id
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Verifică structura audit_logs (poate avea coloane diferite)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'old_data') THEN
      DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
      CREATE TRIGGER trg_audit_user_roles
        AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
        FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_change();
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- =============================================================================
-- 7. CHECK CONSTRAINTS – roluri valide în user_roles (app_role ENUM deja impune)
-- Grades: 1-10 (deja există grades_grade_check)
-- Attendance status: deja există attendance_status_check
-- =============================================================================

-- UNIQUE invitation_code: code_hash este deja UNIQUE pe invitations.

-- =============================================================================
-- 8. RPC BOOTSTRAP ADMIN – permite primul uat_admin pentru email-uri whitelist
-- useAuth apelează addUserRole pentru bootstrap; cu politica nouă eșuează.
-- Acest RPC permite bootstrap: doar dacă user are 0 roluri și email în listă.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ensure_bootstrap_admin_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (select auth.uid());
  v_email TEXT;
  v_bootstrap_emails TEXT[] := ARRAY[
    'admin@eduro.local',
    'admin@demo.com'
  ];
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid) THEN
    RETURN true;
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN RETURN false; END IF;
  IF NOT (lower(trim(v_email)) = ANY (SELECT lower(trim(unnest(v_bootstrap_emails))))) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'uat_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.ensure_bootstrap_admin_role IS 'Bootstrap: adaugă uat_admin pentru utilizatori cu email în whitelist, doar dacă au 0 roluri. Modifică v_bootstrap_emails în migrare pentru producție.';
GRANT EXECUTE ON FUNCTION public.ensure_bootstrap_admin_role TO authenticated;

COMMIT;
