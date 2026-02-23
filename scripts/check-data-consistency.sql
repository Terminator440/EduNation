-- Script verificare consistență date (elev fără clasă, note fără materie, etc.).
-- Rulează în Supabase SQL Editor sau: psql -f scripts/check-data-consistency.sql

-- 1. Elevi fără clasă (class_id NULL sau inexistent)
SELECT 'students_without_valid_class' AS check_name, id, full_name, school_id
FROM public.students s
WHERE s.class_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = s.class_id);

-- 2. Note fără materie validă (subject_id inexistent sau șters)
SELECT 'grades_without_valid_subject' AS check_name, g.id, g.student_id, g.subject_id
FROM public.grades g
WHERE g.deleted_at IS NULL
  AND (g.subject_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subjects sub WHERE sub.id = g.subject_id));

-- 3. Prezență fără materie validă
SELECT 'attendance_without_valid_subject' AS check_name, a.id, a.student_id, a.subject_id
FROM public.attendance a
WHERE a.deleted_at IS NULL
  AND (a.subject_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subjects sub WHERE sub.id = a.subject_id));

-- 4. Clase fără școală validă
SELECT 'classes_without_valid_school' AS check_name, c.id, c.name
FROM public.classes c
WHERE c.school_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.schools sc WHERE sc.id = c.school_id);

-- 5. Note cu student_id inexistent
SELECT 'grades_orphan_student' AS check_name, g.id, g.student_id
FROM public.grades g
WHERE g.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = g.student_id);
