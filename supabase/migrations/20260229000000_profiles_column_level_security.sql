-- =============================================================================
-- Migration: Column-Level Security pe profiles
--
-- Profesorii pot vedea profilurile colegilor (nume, email, rol etc.) dar NU
-- coloanele sensibile: salary, home_address, personal_phone.
-- Acces la aceste coloane doar pentru director și admin.
--
-- Implementare: coloane sensibile în profiles + view „safe” pentru staff,
-- RLS pe profiles astfel încât teacher să nu poată SELECT alte rânduri decât
-- propriul; view-ul expune doar coloanele nesensibile pentru școala utilizatorului.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: COLOANE SENSIBILE PE profiles
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS personal_phone TEXT;

COMMENT ON COLUMN public.profiles.salary IS 'Column-level security: visible only to director and admin.';
COMMENT ON COLUMN public.profiles.home_address IS 'Column-level security: visible only to director and admin.';
COMMENT ON COLUMN public.profiles.personal_phone IS 'Column-level security: visible only to director and admin.';

-- =============================================================================
-- PART 2: VIEW PENTRU STAFF (FĂRĂ COLOANE SENSIBILE)
-- =============================================================================

-- View care expune doar coloanele nesensibile. Folosit de teachers pentru
-- a vedea colegii. Rulează cu SECURITY DEFINER și filtrează după school_id.
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.active_role,
  p.role,
  p.school_id,
  p.class_id,
  p.created_at,
  p.updated_at
  -- Excluse: salary, home_address, personal_phone
FROM public.profiles p
WHERE p.school_id = public.get_user_school_id();

ALTER VIEW public.profiles_safe SET (security_invoker = off);


-- View SECURITY DEFINER: citeste profiles, filtreaza dupa get_user_school_id().
DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.active_role,
  p.role,
  p.school_id,
  p.class_id,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.school_id = public.get_user_school_id();

COMMENT ON VIEW public.profiles_safe IS 'Profiluri fără salary, home_address, personal_phone. Pentru teachers (lista colegi).';

GRANT SELECT ON public.profiles_safe TO authenticated;

-- =============================================================================
-- PART 3: RLS PE profiles – TEACHER NU POATE SELECT ALTE RÂNDURI DECÂT PROPRIUL
-- =============================================================================

-- Eliminăm orice policy care permite teacher să facă SELECT pe toate profilurile
-- (să vadă și coloanele sensibile).
DROP POLICY IF EXISTS "Teachers can view all profiles" ON public.profiles;

-- Păstrăm: utilizatorul își vede propriul profil (toate coloanele)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (id = (select (select auth.uid())));

-- Director și admin pot face SELECT pe toate coloanele (inclusiv sensibile) pentru
-- profilurile din școala lor (sau toate pentru admin).
DROP POLICY IF EXISTS "Directors can view profiles from their school" ON public.profiles;
CREATE POLICY "Directors and admin can view profiles with sensitive columns" ON public.profiles
  FOR SELECT
  USING (
    id = (select auth.uid())
    OR (
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'admin'::public.app_role) OR
        public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
        public.has_role((select auth.uid()), 'developer'::public.app_role)
      )
      AND (
        school_id = public.get_user_school_id()
        OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
        OR public.has_role((select auth.uid()), 'developer'::public.app_role)
      )
    )
  );

-- Teachers văd colegii DOAR prin view-ul profiles_safe (nu au policy pe profiles
-- pentru alți users), deci nu pot face SELECT pe salary, home_address, personal_phone.

-- =============================================================================
-- PART 4: UPDATE PE COLOANE SENSIBILE DOAR PENTRU DIRECTOR / ADMIN
-- =============================================================================

-- Director și admin pot actualiza orice coloane; utilizatorul își poate
-- actualiza propriul profil (dar aplicația poate restricționa la frontend
-- câmpurile sensibile pentru non-admin).
-- Politicile existente de UPDATE rămân; adăugăm doar mențiunea că doar
-- director/admin pot modifica salary, home_address, personal_phone.
-- (La nivel de DB nu putem restricționa per-coloană în RLS; doar per-rând.
-- Deci păstrăm UPDATE ca pentru director/admin și own profile.)
DROP POLICY IF EXISTS "Directors can update profiles from their school" ON public.profiles;
CREATE POLICY "Directors and admin can update profiles" ON public.profiles
  FOR UPDATE
  USING (
    id = (select auth.uid())
    OR (
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'admin'::public.app_role) OR
        public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
        public.has_role((select auth.uid()), 'developer'::public.app_role)
      )
      AND (
        school_id = public.get_user_school_id()
        OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
        OR public.has_role((select auth.uid()), 'developer'::public.app_role)
      )
    )
  )
  WITH CHECK (
    id = (select auth.uid())
    OR (
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'admin'::public.app_role) OR
        public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
        public.has_role((select auth.uid()), 'developer'::public.app_role)
      )
      AND (
        school_id = public.get_user_school_id()
        OR public.has_role((select auth.uid()), 'uat_admin'::public.app_role)
        OR public.has_role((select auth.uid()), 'developer'::public.app_role)
      )
    )
  );

COMMIT;
