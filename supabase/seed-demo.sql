-- Demo data for EduNation (run after migrations).
-- Creates 1 demo school, 2 classes, subjects. Demo users (admin@demo.com, etc.) must be
-- created in Supabase Auth Dashboard or via scripts/create-demo-users (see docs).

BEGIN;

-- Demo school (use a fixed UUID for reference)
INSERT INTO public.schools (id, name, code, address, type, email, phone, created_at, updated_at)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Școala Demo EduNation',
  'DEMO',
  'Str. Demo nr. 1',
  'high_school',
  'contact@demo.edunation.ro',
  NULL,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Demo school year
INSERT INTO public.school_years (id, school_id, label, start_date, end_date, is_active, is_closed, created_at)
SELECT
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  '2025-2026',
  '2025-09-01',
  '2026-06-30',
  true,
  false,
  now()
WHERE EXISTS (SELECT 1 FROM public.schools WHERE id = 'a0000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Add school_id to school_years if column exists (migration may have added it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_years' AND column_name = 'school_id'
  ) THEN
    UPDATE public.school_years SET school_id = 'a0000000-0000-4000-8000-000000000001'
    WHERE id = 'b0000000-0000-4000-8000-000000000001';
  END IF;
END $$;

-- Classes (require school_id on classes)
INSERT INTO public.classes (id, name, school_id, year, section, created_at)
VALUES
  ('c1000000-0000-4000-8000-000000000001', '10A', 'a0000000-0000-4000-8000-000000000001', 10, 'A', now()),
  ('c1000000-0000-4000-8000-000000000002', '10B', 'a0000000-0000-4000-8000-000000000001', 10, 'B', now()),
  ('c1000000-0000-4000-8000-000000000003', '11A', 'a0000000-0000-4000-8000-000000000001', 11, 'A', now())
ON CONFLICT (id) DO NOTHING;

-- Subjects for 10A (class_id optional in schema)
INSERT INTO public.subjects (id, name, class_id, created_at)
VALUES
  (gen_random_uuid(), 'Matematică', 'c1000000-0000-4000-8000-000000000001', now()),
  (gen_random_uuid(), 'Română', 'c1000000-0000-4000-8000-000000000001', now()),
  (gen_random_uuid(), 'Istorie', 'c1000000-0000-4000-8000-000000000001', now())
ON CONFLICT DO NOTHING;

COMMIT;

-- After running this seed, create demo users in Supabase Auth (Dashboard > Authentication > Users):
--   admin@demo.com  / Demo123!  -> then add to user_roles as director, set profile.school_id = a0000000-0000-4000-8000-000000000001
--   teacher@demo.com / Demo123!  -> add as teacher, same school_id
--   parent@demo.com  / Demo123!  -> add as parent, same school_id
-- Optionally run: npx ts-node scripts/create-demo-users.ts (if script exists and SUPABASE_SERVICE_ROLE_KEY is set)
