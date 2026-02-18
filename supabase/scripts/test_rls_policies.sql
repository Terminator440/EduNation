-- Test script for RLS policies on grades table
-- Run this in Supabase SQL Editor to verify policies work correctly
-- 
-- IMPORTANT: These tests simulate different user contexts using SECURITY DEFINER functions
-- In production, RLS policies are enforced automatically by PostgreSQL

-- ============================================================================
-- TEST 1: STUDENT ACCESS - Students can SELECT only their own grades
-- ============================================================================

-- Test: Student should see only their own grades
-- Replace 'STUDENT_USER_ID' with an actual student user_id
SELECT 
  'TEST 1: Student SELECT access' AS test_name,
  * 
FROM public.test_student_grades_access('STUDENT_USER_ID'::uuid);

-- Manual test (requires authenticating as student):
-- 1. Login as student user
-- 2. Run: SELECT COUNT(*) FROM public.grades;
-- 3. Should return only grades where student_id matches student's user_id

-- ============================================================================
-- TEST 2: TEACHER ACCESS - Teachers can INSERT/UPDATE only for assigned classes
-- ============================================================================

-- Test: Teacher should be able to insert/update only for assigned classes
-- Replace with actual IDs from your database
SELECT 
  'TEST 2: Teacher INSERT/UPDATE access' AS test_name,
  *
FROM public.test_teacher_grades_access(
  'TEACHER_USER_ID'::uuid,  -- Teacher's user_id
  'STUDENT_ID'::uuid,        -- Student's id (not user_id)
  'SUBJECT_ID'::uuid         -- Subject's id
);

-- Manual test (requires authenticating as teacher):
-- 1. Login as teacher user
-- 2. Check if teacher is assigned in class_subjects:
SELECT 
  cs.id,
  cs.class_id,
  cs.subject_id,
  cs.teacher_id,
  c.name AS class_name,
  s.name AS subject_name
FROM public.class_subjects cs
JOIN public.classes c ON c.id = cs.class_id
JOIN public.subjects s ON s.id = cs.subject_id
WHERE cs.teacher_id = auth.uid();

-- 3. Try to INSERT a grade for a student in assigned class:
-- INSERT INTO public.grades (student_id, subject_id, grade, date)
-- VALUES ('STUDENT_ID', 'SUBJECT_ID', 8, CURRENT_DATE);
-- Should succeed if teacher is assigned, fail otherwise

-- 4. Try to UPDATE a grade:
-- UPDATE public.grades SET grade = 9 WHERE id = 'GRADE_ID';
-- Should succeed only if teacher is assigned to that student's class/subject

-- ============================================================================
-- TEST 3: PARENT ACCESS - Parents can SELECT only their children's grades
-- ============================================================================

-- Test: Parent should see only their children's grades
-- Replace with actual IDs from your database
SELECT 
  'TEST 3: Parent SELECT access' AS test_name,
  *
FROM public.test_parent_grades_access(
  'PARENT_USER_ID'::uuid,    -- Parent's user_id
  'STUDENT_ID'::uuid         -- Child's student id (not user_id)
);

-- Manual test (requires authenticating as parent):
-- 1. Login as parent user
-- 2. Check parent-student relations:
SELECT 
  psr.id,
  psr.parent_user_id,
  psr.student_id,
  s.full_name AS student_name
FROM public.parent_student_relations psr
JOIN public.students s ON s.id = psr.student_id
WHERE psr.parent_user_id = auth.uid();

-- 3. Try to SELECT grades:
-- SELECT * FROM public.grades WHERE student_id IN (
--   SELECT student_id FROM public.parent_student_relations 
--   WHERE parent_user_id = auth.uid()
-- );
-- Should return only grades for linked children

-- ============================================================================
-- TEST 4: VERIFY CLASS_SUBJECTS ASSIGNMENTS
-- ============================================================================

-- Check all teacher-class-subject assignments
SELECT 
  cs.id,
  cs.teacher_id,
  p.full_name AS teacher_name,
  cs.class_id,
  c.name AS class_name,
  cs.subject_id,
  s.name AS subject_name,
  cs.school_id,
  sch.name AS school_name
FROM public.class_subjects cs
JOIN auth.users u ON u.id = cs.teacher_id
JOIN public.profiles p ON p.id = u.id
JOIN public.classes c ON c.id = cs.class_id
JOIN public.subjects s ON s.id = cs.subject_id
JOIN public.schools sch ON sch.id = cs.school_id
ORDER BY cs.teacher_id, cs.class_id, cs.subject_id;

-- ============================================================================
-- TEST 5: VERIFY PARENT-STUDENT RELATIONS
-- ============================================================================

-- Check all parent-student relations
SELECT 
  psr.id,
  psr.parent_user_id,
  pp.full_name AS parent_name,
  psr.student_id,
  sp.full_name AS student_name,
  psr.is_primary,
  psr.created_at
FROM public.parent_student_relations psr
JOIN auth.users pu ON pu.id = psr.parent_user_id
JOIN public.profiles pp ON pp.id = pu.id
JOIN public.students s ON s.id = psr.student_id
LEFT JOIN auth.users su ON su.id = s.user_id
LEFT JOIN public.profiles sp ON sp.id = su.id
ORDER BY psr.parent_user_id, psr.student_id;

-- ============================================================================
-- TEST 6: COMPREHENSIVE RLS TEST
-- ============================================================================

-- This query shows what each user type can see (run as different users)
-- Run as STUDENT:
SELECT 
  'STUDENT VIEW' AS user_type,
  COUNT(*) AS total_grades_visible,
  COUNT(DISTINCT student_id) AS students_visible,
  COUNT(DISTINCT subject_id) AS subjects_visible
FROM public.grades
WHERE deleted_at IS NULL;

-- Run as TEACHER:
SELECT 
  'TEACHER VIEW' AS user_type,
  COUNT(*) AS total_grades_visible,
  COUNT(DISTINCT student_id) AS students_visible,
  COUNT(DISTINCT subject_id) AS subjects_visible
FROM public.grades
WHERE deleted_at IS NULL;

-- Run as PARENT:
SELECT 
  'PARENT VIEW' AS user_type,
  COUNT(*) AS total_grades_visible,
  COUNT(DISTINCT student_id) AS students_visible,
  COUNT(DISTINCT subject_id) AS subjects_visible
FROM public.grades
WHERE deleted_at IS NULL;

-- ============================================================================
-- TEST 7: VERIFY SEMESTER LOCK ENFORCEMENT
-- ============================================================================

-- Check if semester lock prevents INSERT/UPDATE
-- This should be tested manually by:
-- 1. Creating a semester with is_locked = true
-- 2. Trying to INSERT/UPDATE a grade for that semester
-- 3. Should fail with RLS policy violation

-- Check locked semesters:
SELECT 
  s.id,
  s.school_id,
  sch.name AS school_name,
  s.academic_year,
  s.semester,
  s.is_locked,
  s.locked_at,
  p.full_name AS locked_by_name
FROM public.semesters s
JOIN public.schools sch ON sch.id = s.school_id
LEFT JOIN auth.users u ON u.id = s.locked_by
LEFT JOIN public.profiles p ON p.id = u.id
WHERE s.is_locked = true
ORDER BY s.academic_year DESC, s.semester;

-- ============================================================================
-- EXPECTED RESULTS SUMMARY
-- ============================================================================

-- Expected behavior:
-- 1. STUDENT: Can SELECT only grades where student_id matches their user_id (via students.user_id)
-- 2. TEACHER: Can INSERT/UPDATE only grades for classes/subjects assigned in class_subjects
-- 3. PARENT: Can SELECT only grades for students linked via parent_student_relations
-- 4. STAFF: Can SELECT/INSERT/UPDATE all grades from their school
-- 5. SEMESTER LOCK: Prevents INSERT/UPDATE when semester is_locked = true (except staff)

-- To verify policies are working:
-- 1. Login as each user type (student, teacher, parent)
-- 2. Run SELECT queries on grades table
-- 3. Verify only expected rows are returned
-- 4. Try INSERT/UPDATE operations and verify they succeed/fail as expected
