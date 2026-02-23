-- Feature flags: enable/disable features per school.

CREATE TABLE IF NOT EXISTS public.features (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_features (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, feature_id)
);

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_features ENABLE ROW LEVEL SECURITY;

-- Features list: only readable by authenticated (names are non-sensitive)
CREATE POLICY "features_select_all"
  ON public.features FOR SELECT TO authenticated USING (true);

-- School features: users see only their school's flags
CREATE POLICY "school_features_select_own_school"
  ON public.school_features FOR SELECT TO authenticated
  USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    OR has_role(auth.uid(), 'uat_admin'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  );

-- Only staff / uat_admin can update school_features
CREATE POLICY "school_features_update_staff"
  ON public.school_features FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'secretariat'::app_role))
    AND school_id IN (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    OR has_role(auth.uid(), 'uat_admin'::app_role)
    OR has_role(auth.uid(), 'developer'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_school_features_school ON public.school_features(school_id);
CREATE INDEX IF NOT EXISTS idx_school_features_feature ON public.school_features(feature_id);

-- Seed a few feature names (idempotent)
INSERT INTO public.features (name, description) VALUES
  ('timetable', 'Orar săptămânal'),
  ('reports_pdf', 'Rapoarte PDF'),
  ('bulk_grades', 'Note în masă'),
  ('student_import_csv', 'Import elevi CSV'),
  ('billing', 'Facturare anuală')
ON CONFLICT (name) DO NOTHING;
