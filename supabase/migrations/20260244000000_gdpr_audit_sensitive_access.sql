-- GDPR: log acces la date sensibile (export date, ștergere cont) în audit_logs.

CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile JSONB;
  v_roles JSONB;
  v_grades JSONB;
  v_attendance JSONB;
  v_result JSONB;
  v_user_name TEXT;
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Audit: log acces la date sensibile (export GDPR)
  SELECT p.full_name, p.active_role INTO v_user_name, v_role
  FROM public.profiles p WHERE p.id = v_uid LIMIT 1;
  INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    COALESCE(v_user_name, ''),
    COALESCE(v_role, 'student'::app_role),
    'sensitive_data_export',
    'profiles',
    v_uid::text,
    jsonb_build_object('reason', 'GDPR export my data')
  );

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

CREATE OR REPLACE FUNCTION public.soft_delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user_name TEXT;
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Audit: log cerere ștergere cont (acces date sensibile)
  SELECT p.full_name, p.active_role INTO v_user_name, v_role
  FROM public.profiles p WHERE p.id = v_uid LIMIT 1;
  INSERT INTO public.audit_logs (user_id, user_name, active_role, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    COALESCE(v_user_name, ''),
    COALESCE(v_role, 'student'::app_role),
    'account_deletion_request',
    'profiles',
    v_uid::text,
    jsonb_build_object('reason', 'GDPR soft delete account')
  );

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

COMMENT ON FUNCTION public.export_my_data IS 'GDPR: export date personale; log acces în audit_logs.';
COMMENT ON FUNCTION public.soft_delete_my_account IS 'GDPR: ștergere cont; log cerere în audit_logs.';
