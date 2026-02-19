-- =============================================================================
-- Migration: Populate teacher_assignments from existing data
-- Run this AFTER 20260224000000_multi_tenant_rls_refactor.sql
-- 
-- This migration populates the teacher_assignments table from existing
-- class_subjects or subjects table data.
-- =============================================================================

BEGIN;

-- 1) Populate teacher_assignments from class_subjects (if exists)
INSERT INTO public.teacher_assignments (teacher_id, class_id, subject_id, school_id)
SELECT DISTINCT
  cs.teacher_id,
  cs.class_id,
  cs.subject_id,
  cs.school_id
FROM public.class_subjects cs
WHERE cs.teacher_id IS NOT NULL
  AND cs.class_id IS NOT NULL
  AND cs.subject_id IS NOT NULL
  AND cs.school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = cs.teacher_id
      AND ta.class_id = cs.class_id
      AND ta.subject_id = cs.subject_id
      AND ta.semester_id IS NULL -- Match NULL semester_id
  )
ON CONFLICT (teacher_id, class_id, subject_id, semester_id) DO NOTHING;

-- 2) Populate teacher_assignments from subjects table (fallback if class_subjects doesn't exist or is incomplete)
INSERT INTO public.teacher_assignments (teacher_id, class_id, subject_id, school_id)
SELECT DISTINCT
  s.teacher_id,
  s.class_id,
  s.id AS subject_id,
  s.school_id
FROM public.subjects s
WHERE s.teacher_id IS NOT NULL
  AND s.class_id IS NOT NULL
  AND s.school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = s.teacher_id
      AND ta.class_id = s.class_id
      AND ta.subject_id = s.id
      AND ta.semester_id IS NULL
  )
ON CONFLICT (teacher_id, class_id, subject_id, semester_id) DO NOTHING;

-- 3) Verify data integrity
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.teacher_assignments;
  
  IF v_count = 0 THEN
    RAISE WARNING 'No teacher_assignments were created. Please verify source data exists.';
  ELSE
    RAISE NOTICE 'Created % teacher_assignments entries', v_count;
  END IF;
END $$;

COMMIT;
