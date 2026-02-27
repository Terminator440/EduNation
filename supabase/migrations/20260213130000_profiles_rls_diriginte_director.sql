-- Profiles UPDATE: Diriginte can edit students/parents in their class; Director can edit teachers, students, own.
-- Students/Parents: name/phone read-only (enforced by frontend + RLS denies their UPDATE).

-- Drop existing update policy and recreate with full hierarchy
DROP POLICY IF EXISTS "Profiles: update if higher or equal role" ON public.profiles;

CREATE POLICY "Profiles: update if higher or equal role"
  ON public.profiles
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND (
      -- 1) Editing own profile: staff (teacher+) can update
      (id = (select auth.uid()) AND (
        public.profile_role_rank(COALESCE(
          (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = (select auth.uid()) LIMIT 1),
          'student'::public.app_role
        )) >= 2
      ))
      OR
      -- 2) Director/uat_admin: can edit any profile (teachers, students, parents)
      (id != (select auth.uid()) AND (
        has_role((select auth.uid()), 'director'::public.app_role)
        OR has_role((select auth.uid()), 'uat_admin'::public.app_role)
      ))
      OR
      -- 3) Diriginte: can edit students and parents in their class
      (id != (select auth.uid()) AND has_role((select auth.uid()), 'homeroom_teacher'::public.app_role) AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.classes c ON c.id = s.class_id AND c.teacher_id = (select auth.uid())
        WHERE s.user_id = public.profiles.id
        UNION
        SELECT 1 FROM public.parent_student_relations psr
        JOIN public.students s ON s.id = psr.student_id
        JOIN public.classes c ON c.id = s.class_id AND c.teacher_id = (select auth.uid())
        WHERE psr.parent_user_id = public.profiles.id
      ))
    )
  );
