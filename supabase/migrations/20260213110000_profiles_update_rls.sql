-- Profiles: ensure users can view own profile + strict UPDATE by role.
-- Business rules: Students/Parents = read-only name/phone; Teachers/Directors can edit Students/Parents;
-- Directors can edit Teachers and their own. Frontend enforces field-level disable; RLS enforces row-level.

-- Allow any authenticated user to view their own profile (required for Settings page)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND id = auth.uid());

-- Helper: role rank for comparison (higher = more privilege)
-- student=1, parent=1, teacher=2, homeroom_teacher=2, secretariat=3, director=4, uat_admin=4, developer=5
CREATE OR REPLACE FUNCTION public.profile_role_rank(r public.app_role)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE r
    WHEN 'student' THEN 1
    WHEN 'parent' THEN 1
    WHEN 'teacher' THEN 2
    WHEN 'homeroom_teacher' THEN 2
    WHEN 'secretariat' THEN 3
    WHEN 'director' THEN 4
    WHEN 'uat_admin' THEN 4
    WHEN 'developer' THEN 5
    ELSE 0
  END;
$$;

-- Allow UPDATE on profiles if:
-- 1) Editing own profile AND editor has role rank >= target's role rank (staff can edit self)
-- 2) OR editing someone else's profile AND editor is director/uat_admin (can edit teachers, students, parents)
CREATE POLICY "Profiles: update if higher or equal role"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Editing own profile: staff (teacher+) can update
      (id = auth.uid() AND (
        public.profile_role_rank(COALESCE(
          (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1),
          'student'::public.app_role
        )) >= 2
      ))
      OR
      -- Editing another user: director/uat_admin only
      (id != auth.uid() AND (
        has_role(auth.uid(), 'director'::public.app_role)
        OR has_role(auth.uid(), 'uat_admin'::public.app_role)
      ))
    )
  );
