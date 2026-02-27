-- =============================================================================
-- Multi-Level Invitations System (Multi-level Invitations)
--
-- Cerințe tabel invitations: email, role, school_id, class_id (opțional), token,
-- expires_at, invited_by.
-- Mapare: email = invited_email; token = code_hash (hash al codului, token-ul
-- în clar se returnează la create_invitation); invited_by adăugat/backfill.
--
-- Ierarhie:
-- 1. Dev -> Director: Developer creează școala și invită Directorul (owner școală)
-- 2. Director -> Diriginți: Director invită profesorii și le atribuie rolul de
--    homeroom_teacher pentru o clasă specifică (class_id).
-- 3. Diriginți -> Toți ceilalți: Dirigintele poate invita:
--    - Profesorii de la clasa lui (pentru a-i lega de teacher_assignments)
--    - Elevii clasei sale
--    - Părinții (cu legătură automată către copil)
--
-- Restricții:
-- - Dirigintele NU poate invita elevi/părinți la altă clasă decât cea unde
--   este marcat ca homeroom (classes.teacher_id). RLS: homeroom doar class_id
--   în clasele lui.
-- - La acceptarea invitației de părinte, claim_invitation creează automat
--   rândul în parent_student_relations.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ASIGURĂ INVITATION_ROLE ENUM ARE TOATE VALORILE
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_role') THEN
    CREATE TYPE public.invitation_role AS ENUM (
      'director', 'teacher', 'homeroom_teacher', 'secretariat', 'student', 'parent'
    );
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'invitation_role' AND e.enumlabel = 'secretariat') THEN
      ALTER TYPE public.invitation_role ADD VALUE 'secretariat';
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 2. ASIGURĂ INVITATIONS TABLE ARE COLOANELE NECESARE
-- =============================================================================

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill invited_by from created_by_user_id
UPDATE public.invitations SET invited_by = created_by_user_id WHERE invited_by IS NULL;

-- Set invited_by NOT NULL after backfill (if all rows have it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.invitations WHERE invited_by IS NULL) THEN
    ALTER TABLE public.invitations ALTER COLUMN invited_by SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.invitations.invited_by IS 'Utilizatorul care a creat invitația (invited_by din cerințe).';
COMMENT ON COLUMN public.invitations.invited_email IS 'Email-ul persoanei invitate (câmpul email din cerințe).';
COMMENT ON COLUMN public.invitations.code_hash IS 'Token-ul invitației stocat ca hash; token-ul în clar se returnează la create_invitation.';

-- =============================================================================
-- 3. CLAIM_INVITATION: CREEAZĂ AUTOMAT parent_student_relations PENTRU PARENT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_invitation(p_code_hash text, p_user_id uuid)
RETURNS TABLE (
  success boolean,
  invitation_id uuid,
  role public.invitation_role,
  school_id uuid,
  class_id uuid,
  student_id uuid,
  first_name text,
  last_name text,
  invited_student_number integer,
  invited_email text,
  invited_phone text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations i
  WHERE i.code_hash = p_code_hash
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND i.current_uses < i.max_uses
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false::boolean,
      NULL::uuid, NULL::public.invitation_role, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::text, NULL::text, NULL::integer, NULL::text, NULL::text,
      'Codul de invitație este invalid, expirat sau a fost deja folosit.'::text;
    RETURN;
  END IF;

  UPDATE public.invitations
  SET current_uses = current_uses + 1,
      used_at = CASE WHEN current_uses + 1 >= max_uses THEN now() ELSE used_at END,
      used_by_user_id = p_user_id
  WHERE id = v_inv.id;

  -- Creare automată parent_student_relations când părinte acceptă invitația
  IF v_inv.role = 'parent'::public.invitation_role AND v_inv.student_id IS NOT NULL THEN
    INSERT INTO public.parent_student_relations (parent_user_id, student_id, is_primary)
    VALUES (p_user_id, v_inv.student_id, false)
    ON CONFLICT (parent_user_id, student_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT
    true::boolean,
    v_inv.id, v_inv.role, v_inv.school_id, v_inv.class_id, v_inv.student_id,
    v_inv.first_name, v_inv.last_name, v_inv.invited_student_number,
    v_inv.invited_email, v_inv.invited_phone,
    NULL::text;
END;
$$;

COMMENT ON FUNCTION public.claim_invitation IS 'Validează și marchează invitația ca folosită. Pentru părinți, creează automat legătura în parent_student_relations.';

-- =============================================================================
-- 4. CREATE_INVITATION: IERARHIE DEV -> DIRECTOR -> DIRIGINȚI -> REST
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_role public.invitation_role,
  p_school_id uuid,
  p_class_id uuid DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_student_number integer DEFAULT NULL,
  p_invited_email text DEFAULT NULL,
  p_invited_phone text DEFAULT NULL,
  p_intended_for text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_max_uses integer DEFAULT 1,
  p_expires_hours integer DEFAULT 24
)
RETURNS TABLE(invitation_id uuid, plain_code text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_plain_code text;
  v_code_hash text;
  v_invitation_id uuid;
  v_creator_id uuid;
  v_class_school_id uuid;
  v_homeroom_class_id uuid;
BEGIN
  v_creator_id := COALESCE(p_created_by, auth.uid());
  v_user_id := v_creator_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'User not authenticated'::text;
    RETURN;
  END IF;

  IF p_max_uses < 1 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Max uses must be at least 1'::text;
    RETURN;
  END IF;

  IF p_expires_hours < 1 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Expires hours must be at least 1'::text;
    RETURN;
  END IF;

  -- IERARHIE: Developer -> Director
  IF public.has_role(v_user_id, 'developer'::public.app_role) THEN
    -- Developer poate invita director pentru orice școală
    IF p_role = 'director'::public.invitation_role THEN
      IF p_class_id IS NOT NULL OR p_student_id IS NOT NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director invitations cannot have class_id or student_id'::text;
        RETURN;
      END IF;
    END IF;
    -- Developer poate invita orice rol (pentru setup inițial)

  -- IERARHIE: Director -> Diriginți / Profesori / Secretariat
  ELSIF public.has_role(v_user_id, 'director'::public.app_role) THEN
    IF p_role NOT IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Directors can only invite teacher / homeroom_teacher / secretariat'::text;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.school_id = p_school_id) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Director can only create invitations for their school'::text;
      RETURN;
    END IF;
    -- Pentru homeroom_teacher, director setează class_id (clasa atribuită)
    IF p_role = 'homeroom_teacher'::public.invitation_role AND p_class_id IS NOT NULL THEN
      SELECT c.school_id INTO v_class_school_id FROM public.classes c WHERE c.id = p_class_id;
      IF v_class_school_id IS NULL OR v_class_school_id <> p_school_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class does not belong to the specified school'::text;
        RETURN;
      END IF;
    END IF;
    -- Pentru teacher/secretariat, class_id trebuie să fie NULL
    IF p_role IN ('teacher'::public.invitation_role, 'secretariat'::public.invitation_role) THEN
      p_class_id := NULL;
      p_student_id := NULL;
    END IF;

  -- IERARHIE: Diriginți -> Profesori / Elevi / Părinți (DOAR pentru clasa lor)
  ELSIF public.has_role(v_user_id, 'homeroom_teacher'::public.app_role) THEN
    IF p_role NOT IN ('student'::public.invitation_role, 'parent'::public.invitation_role, 'teacher'::public.invitation_role) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Homeroom teachers can only invite student / parent / teacher'::text;
      RETURN;
    END IF;

    -- Verifică că dirigintele are o clasă (homeroom)
    SELECT c.id INTO v_homeroom_class_id
    FROM public.classes c
    WHERE c.teacher_id = v_user_id AND c.school_id = p_school_id
    LIMIT 1;

    IF v_homeroom_class_id IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'You are not a homeroom teacher for any class in this school'::text;
      RETURN;
    END IF;

    -- Pentru student/parent: class_id TREBUIE să fie clasa dirigintei
    IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) THEN
      IF p_class_id IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
        RETURN;
      END IF;
      IF p_class_id <> v_homeroom_class_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You can only invite students/parents for your own class'::text;
        RETURN;
      END IF;
      SELECT c.school_id INTO v_class_school_id FROM public.classes c WHERE c.id = p_class_id;
      IF v_class_school_id IS NULL OR v_class_school_id <> p_school_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class does not belong to the specified school'::text;
        RETURN;
      END IF;
    END IF;

    -- Pentru teacher: class_id TREBUIE să fie clasa dirigintei (pentru teacher_assignments)
    IF p_role = 'teacher'::public.invitation_role THEN
      IF p_class_id IS NULL THEN
        p_class_id := v_homeroom_class_id;
      END IF;
      IF p_class_id <> v_homeroom_class_id THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'You can only invite teachers for your own class'::text;
        RETURN;
      END IF;
      p_student_id := NULL;
    END IF;

    -- Pentru parent: student_id este obligatoriu
    IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, 'Student is required for parent invitations'::text;
      RETURN;
    END IF;
    -- Verifică că student_id aparține clasei dirigintei
    IF p_role = 'parent'::public.invitation_role AND p_student_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = p_student_id AND s.class_id = v_homeroom_class_id
      ) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, 'Student does not belong to your class'::text;
        RETURN;
      END IF;
    END IF;

  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Not authorized to create invitations'::text;
    RETURN;
  END IF;

  -- Validări generale
  IF p_role IN ('student'::public.invitation_role, 'parent'::public.invitation_role) AND p_class_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Class is required for student/parent invitations'::text;
    RETURN;
  END IF;

  IF p_role = 'parent'::public.invitation_role AND p_student_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'Student is required for parent invitations'::text;
    RETURN;
  END IF;

  v_plain_code := public.generate_invitation_code();
  v_code_hash := public.hash_invitation_code(v_plain_code);

  INSERT INTO public.invitations (
    role, school_id, class_id, student_id,
    first_name, last_name, invited_student_number, invited_email, invited_phone, intended_for,
    code_hash, created_by_user_id, invited_by, expires_at, max_uses
  ) VALUES (
    p_role, p_school_id, p_class_id, p_student_id,
    NULLIF(trim(p_first_name), ''), NULLIF(trim(p_last_name), ''),
    p_student_number,
    NULLIF(trim(p_invited_email), ''), NULLIF(trim(p_invited_phone), ''),
    NULLIF(trim(p_intended_for), ''),
    v_code_hash, v_creator_id, v_creator_id,
    NOW() + (p_expires_hours || ' hours')::interval,
    p_max_uses
  )
  RETURNING id INTO v_invitation_id;

  RETURN QUERY SELECT v_invitation_id, v_plain_code, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.create_invitation(public.invitation_role, uuid, uuid, uuid, text, text, integer, text, text, text, uuid, integer, integer) IS 'Creează invitație conform ierarhiei: Dev->Director, Director->Diriginți/Profesori, Diriginți->Elevi/Părinți/Profesori (doar pentru clasa lor).';

-- =============================================================================
-- 5. RLS: RESTRICȚII STRICTE PENTRU DIRIGINȚI (DOAR CLASA LOR)
-- =============================================================================

-- Șterge politicile vechi care permit dirigintei să invite pentru alte clase
DROP POLICY IF EXISTS "Homeroom teachers can manage student parent invitations" ON public.invitations;
DROP POLICY IF EXISTS "Homeroom teachers can manage student parent teacher invitations" ON public.invitations;

-- Dirigintele poate SELECT invitațiile pentru clasa lui
CREATE POLICY "homeroom_select_own_class_invitations" ON public.invitations
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
  );

-- Dirigintele poate INSERT invitații DOAR pentru clasa lui
CREATE POLICY "homeroom_insert_own_class_invitations" ON public.invitations
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND role IN ('student'::public.invitation_role, 'parent'::public.invitation_role, 'teacher'::public.invitation_role)
    AND class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
    AND school_id = public.get_user_school_id()
  );

-- Dirigintele poate UPDATE (revoca) invitațiile pentru clasa lui
CREATE POLICY "homeroom_update_own_class_invitations" ON public.invitations
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'homeroom_teacher'::public.app_role)
    AND class_id IN (
      SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    )
  );

-- Director: poate SELECT/INSERT/UPDATE invitații pentru teacher/homeroom_teacher/secretariat în școala lui
DROP POLICY IF EXISTS "Directors can manage teacher invitations" ON public.invitations;
CREATE POLICY "director_manage_staff_invitations" ON public.invitations
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'director'::public.app_role)
    AND role IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role)
    AND school_id = public.get_user_school_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'director'::public.app_role)
    AND role IN ('teacher'::public.invitation_role, 'homeroom_teacher'::public.invitation_role, 'secretariat'::public.invitation_role)
    AND school_id = public.get_user_school_id()
  );

-- Developer: poate gestiona toate invitațiile
-- (Dacă politica există deja, o ștergem și o recreăm pentru consistență)
DROP POLICY IF EXISTS "Developers can manage all invitations" ON public.invitations;
CREATE POLICY "Developers can manage all invitations" ON public.invitations
  FOR ALL
  USING (public.has_role(auth.uid(), 'developer'::public.app_role));

-- Utilizatorii pot vedea invitațiile create de ei
DROP POLICY IF EXISTS "Users can see own invitations" ON public.invitations;
CREATE POLICY "users_select_own_invitations" ON public.invitations
  FOR SELECT
  USING (created_by_user_id = auth.uid() OR invited_by = auth.uid());

-- Oricine poate valida invitații (pentru signup)
DROP POLICY IF EXISTS "Anyone can validate invitations" ON public.invitations;
CREATE POLICY "anyone_validate_invitations" ON public.invitations
  FOR SELECT
  USING (
    revoked_at IS NULL
    AND expires_at > now()
    AND current_uses < max_uses
  );

GRANT EXECUTE ON FUNCTION public.create_invitation(public.invitation_role, uuid, uuid, uuid, text, text, integer, text, text, text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation(text, uuid) TO authenticated;

COMMIT;
