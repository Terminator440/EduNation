-- =============================================================================
-- GDPR: export date utilizator, soft delete cont, jurnal acces (audit_logs existent).
-- =============================================================================

BEGIN;

-- 1) deleted_at pe profiles pentru soft delete cont
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.deleted_at IS 'GDPR: soft delete; cont șters la cererea utilizatorului.';

-- 2) RPC: export date utilizator (GDPR drept la portabilitate)
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (select auth.uid());
  v_profile JSONB;
  v_roles JSONB;
  v_grades JSONB;
  v_attendance JSONB;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_uid AND p.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(ur.role), '[]'::jsonb) INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid;

  SELECT COALESCE(
    (SELECT jsonb_agg(g) FROM (
      SELECT g.id, g.grade, g.date, g.description, g.created_at,
             (SELECT name FROM public.subjects WHERE id = g.subject_id) AS subject_name
      FROM public.grades g
      JOIN public.students s ON s.id = g.student_id AND s.user_id = v_uid
      WHERE g.deleted_at IS NULL
    ) g),
    '[]'::jsonb
  ) INTO v_grades;

  SELECT COALESCE(
    (SELECT jsonb_agg(a) FROM (
      SELECT a.id, a.date, a.status, a.is_excused, a.created_at,
             (SELECT name FROM public.subjects WHERE id = a.subject_id) AS subject_name
      FROM public.attendance a
      JOIN public.students s ON s.id = a.student_id AND s.user_id = v_uid
    ) a),
    '[]'::jsonb
  ) INTO v_attendance;

  v_result := jsonb_build_object(
    'exported_at', now(),
    'profile', v_profile,
    'roles', v_roles,
    'grades', v_grades,
    'attendance', v_attendance
  );
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.export_my_data IS 'GDPR: export date personale pentru utilizatorul autentificat.';

-- 3) RPC: soft delete cont (anonymize profile, set deleted_at)
CREATE OR REPLACE FUNCTION public.soft_delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (select auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.profiles
  SET
    full_name = 'Utilizator șters',
    email = 'deleted-' || v_uid::text || '@deleted.local',
    phone = NULL,
    deleted_at = now(),
    updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.soft_delete_my_account IS 'GDPR: ștergere cont (soft delete, anonimizare date).';

-- RLS: exclude utilizatori șterși din select (opțional – poate fi aplicat în politici existente)
-- Nu schimbăm politici aici; aplicația poate filtra deleted_at la login.

COMMIT;
