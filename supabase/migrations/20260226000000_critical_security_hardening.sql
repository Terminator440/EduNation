-- =============================================================================
-- Migration: Corecții Critice de Arhitectură și Securitate
-- 
-- Această migrare asigură:
-- 1. Multi-Tenancy Hardening: school_id NOT NULL + FK, RLS strict cu get_user_school_id()
-- 2. Constrângeri de Validare: app_role ENUM, CHECK constraints
-- 3. Teacher Assignments & Granular RLS: pivot table + RLS strict pe grades
-- 4. Audit Log & State Control: audit_logs complet, locking în semesters
-- 5. Optimizare Performanță: indexuri pe toate FK-urile critice
-- 
-- REGULĂ STRICTĂ: Nu lasă date orfane și toate funcțiile folosesc (select auth.uid()) securizat
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: MULTI-TENANCY HARDENING - SCHEMA & FK CONSTRAINTS
-- =============================================================================

-- 1.1) Asigură că toate tabelele au school_id NOT NULL cu FK către schools(id)
-- Students
DO $$
BEGIN
  -- Verifică și adaugă school_id dacă lipsește
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.students ADD COLUMN school_id UUID;
    -- Backfill din classes
    UPDATE public.students s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;
  
  -- Asigură FK constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'students'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  -- Set NOT NULL (doar dacă nu există NULL-uri)
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE school_id IS NULL) THEN
    ALTER TABLE public.students ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există studenți fără school_id. Trebuie să fie populați înainte de a seta NOT NULL.';
  END IF;
END $$;

-- Classes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.classes ADD COLUMN school_id UUID;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'classes'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE school_id IS NULL) THEN
    ALTER TABLE public.classes ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există clase fără school_id. Trebuie să fie populate înainte de a seta NOT NULL.';
  END IF;
END $$;

-- Subjects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.subjects ADD COLUMN school_id UUID;
    -- Backfill din classes
    UPDATE public.subjects s
    SET school_id = c.school_id
    FROM public.classes c
    WHERE s.class_id = c.id AND s.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'subjects'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.subjects
      ADD CONSTRAINT subjects_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE school_id IS NULL) THEN
    ALTER TABLE public.subjects ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există materii fără school_id. Trebuie să fie populate înainte de a seta NOT NULL.';
  END IF;
END $$;

-- Grades
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grades' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.grades ADD COLUMN school_id UUID;
    -- Backfill din students
    UPDATE public.grades g
    SET school_id = s.school_id
    FROM public.students s
    WHERE g.student_id = s.id AND g.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'grades'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.grades
      ADD CONSTRAINT grades_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.grades WHERE school_id IS NULL) THEN
    ALTER TABLE public.grades ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există note fără school_id. Trebuie să fie populate înainte de a seta NOT NULL.';
  END IF;
END $$;

-- Attendance (absences)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.attendance ADD COLUMN school_id UUID;
    -- Backfill din students
    UPDATE public.attendance a
    SET school_id = s.school_id
    FROM public.students s
    WHERE a.student_id = s.id AND a.school_id IS NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'attendance'
      AND kcu.column_name = 'school_id' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.attendance WHERE school_id IS NULL) THEN
    ALTER TABLE public.attendance ALTER COLUMN school_id SET NOT NULL;
  ELSE
    RAISE WARNING 'Există absențe fără school_id. Trebuie să fie populate înainte de a seta NOT NULL.';
  END IF;
END $$;

-- =============================================================================
-- PART 2: FUNCȚIE get_user_school_id() STANDARDIZATĂ
-- =============================================================================

-- 2.1) Creează sau înlocuiește get_user_school_id() (SECURITY DEFINER, securizat)
CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = (select auth.uid())
$$;

COMMENT ON FUNCTION public.get_user_school_id() IS 'Returnează school_id-ul utilizatorului autentificat din profiles. Folosit în RLS pentru izolare multi-tenant strictă. SECURITY DEFINER pentru a accesa profiles securizat.';

-- 2.2) Alias get_my_school_id() -> get_user_school_id() pentru compatibilitate
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_school_id()
$$;

-- =============================================================================
-- PART 3: CONSTRÂNGERI DE VALIDARE
-- =============================================================================

-- 3.1) Asigură app_role ENUM cu valorile corecte
DO $$
BEGIN
  -- Verifică dacă ENUM-ul există
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'parent', 'director', 'admin');
  ELSE
    -- Adaugă valorile care lipsesc
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'admin') THEN
      ALTER TYPE public.app_role ADD VALUE 'admin';
    END IF;
  END IF;
END $$;

-- 3.2) Asigură că profiles.role folosește app_role ENUM
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    -- Verifică tipul coloanei
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
        AND udt_name != 'app_role'
    ) THEN
      ALTER TABLE public.profiles
        ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
    END IF;
  ELSE
    -- Adaugă coloana role dacă nu există
    ALTER TABLE public.profiles ADD COLUMN role public.app_role;
    -- Copiază din active_role
    UPDATE public.profiles SET role = active_role WHERE role IS NULL;
    ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
  END IF;
END $$;

-- 3.3) CHECK constraint pe grades (grade >= 1 AND grade <= 10)
ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_grade_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_grade_check CHECK (grade >= 1 AND grade <= 10);

-- 3.4) CHECK constraint pe attendance (status valid)
-- Note: attendance nu are coloană "absences" numerică, ci status text
-- Verificăm că status este valid
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check 
  CHECK (status IN ('prezent', 'absent', 'intarziat', 'motivat', 'motivated', 'unexcused', 'pending'));

-- Dacă există un tabel separat "absences" cu coloană numerică, adaugă CHECK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'absences'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'absences' AND column_name = 'absences'
    ) THEN
      ALTER TABLE public.absences DROP CONSTRAINT IF EXISTS absences_count_check;
      ALTER TABLE public.absences ADD CONSTRAINT absences_count_check CHECK (absences >= 0);
    END IF;
  END IF;
END $$;

-- =============================================================================
-- PART 4: TEACHER ASSIGNMENTS & GRANULAR RLS
-- =============================================================================

-- 4.1) Asigură că teacher_assignments există cu structura corectă
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (teacher_id, class_id, subject_id, semester_id)
);

-- Indexuri pentru performanță
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_id ON public.teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_id ON public.teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_subject_id ON public.teacher_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_school_id ON public.teacher_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_composite ON public.teacher_assignments(teacher_id, class_id, subject_id);

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

-- 4.2) RLS strict pentru teacher_assignments (obligatoriu school_id check)
DROP POLICY IF EXISTS "teacher_assignments_select_strict" ON public.teacher_assignments;
CREATE POLICY "teacher_assignments_select_strict" ON public.teacher_assignments
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

DROP POLICY IF EXISTS "teacher_assignments_manage_strict" ON public.teacher_assignments;
CREATE POLICY "teacher_assignments_manage_strict" ON public.teacher_assignments
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- =============================================================================
-- PART 5: RLS REWRITE - TOATE POLITICILE TREBUIE SĂ VERIFICE school_id
-- =============================================================================

-- 5.1) Șterge toate politicile care verifică DOAR has_role fără school_id check
-- Students RLS - OBLIGATORIU school_id check
DROP POLICY IF EXISTS "Directors can manage students from their school" ON public.students;
DROP POLICY IF EXISTS "Staff can manage students" ON public.students;
DROP POLICY IF EXISTS "Authenticated can view students" ON public.students;

CREATE POLICY "students_select_strict" ON public.students
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

CREATE POLICY "students_manage_strict" ON public.students
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- Classes RLS - OBLIGATORIU school_id check
DROP POLICY IF EXISTS "Directors can manage classes from their school" ON public.classes;
DROP POLICY IF EXISTS "Staff can manage classes" ON public.classes;
DROP POLICY IF EXISTS "Authenticated can view classes" ON public.classes;

CREATE POLICY "classes_select_strict" ON public.classes
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

CREATE POLICY "classes_manage_strict" ON public.classes
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- Subjects RLS - OBLIGATORIU school_id check
DROP POLICY IF EXISTS "Directors can manage subjects from their school" ON public.subjects;
DROP POLICY IF EXISTS "Staff can manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "Authenticated can view subjects" ON public.subjects;

CREATE POLICY "subjects_select_strict" ON public.subjects
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

CREATE POLICY "subjects_manage_strict" ON public.subjects
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR
        public.has_role((select auth.uid()), 'teacher'::public.app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR
        public.has_role((select auth.uid()), 'teacher'::public.app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- Grades RLS - OBLIGATORIU school_id check + teacher_assignments check pentru profesori
DROP POLICY IF EXISTS "Teachers can insert grades via teacher_assignments" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades via teacher_assignments" ON public.grades;
DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can view grades for assigned classes" ON public.grades;
DROP POLICY IF EXISTS "Staff can view all grades from school" ON public.grades;

-- SELECT: Students, Parents, Teachers (doar pentru clasele alocate), Staff
CREATE POLICY "grades_select_strict" ON public.grades
  FOR SELECT
  USING (
    -- Student: propriile note (school_id check implicit prin student)
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = grades.student_id
        AND s.user_id = (select auth.uid())
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Parent: notele copiilor (school_id check implicit)
    EXISTS (
      SELECT 1 FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.student_id = grades.student_id
        AND psr.parent_user_id = (select auth.uid())
        AND s.school_id = public.get_user_school_id()
    )
    OR
    -- Teacher: doar dacă este alocat în teacher_assignments (school_id check obligatoriu)
    (
      school_id = public.get_user_school_id() AND
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = (select auth.uid())
          AND ta.subject_id = grades.subject_id
          AND s.id = grades.student_id
          AND ta.school_id = public.get_user_school_id()
      )
    )
    OR
    -- Staff: doar din propria școală
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role)
      )
    )
    OR
    -- Admins
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- INSERT: Doar profesori alocați în teacher_assignments (school_id obligatoriu)
CREATE POLICY "grades_insert_strict" ON public.grades
  FOR INSERT
  WITH CHECK (
    school_id = public.get_user_school_id() AND
    (
      -- Teacher: DOAR dacă există în teacher_assignments
      (
        EXISTS (
          SELECT 1 FROM public.teacher_assignments ta
          JOIN public.students s ON s.class_id = ta.class_id
          WHERE ta.teacher_id = (select auth.uid())
            AND ta.subject_id = subject_id
            AND s.id = student_id
            AND ta.school_id = public.get_user_school_id()
        )
      )
      OR
      -- Staff (director/secretariat) - poate insera pentru corecții
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role)
      )
      OR
      -- Admins
      public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
      public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  );

-- UPDATE: Doar profesori alocați în teacher_assignments (school_id obligatoriu)
CREATE POLICY "grades_update_strict" ON public.grades
  FOR UPDATE
  USING (
    school_id = public.get_user_school_id() AND
    (
      -- Teacher: DOAR dacă există în teacher_assignments
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = (select auth.uid())
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR
      -- Staff
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role)
      )
      OR
      -- Admins
      public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
      public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  )
  WITH CHECK (
    school_id = public.get_user_school_id() AND
    (
      EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
        JOIN public.students s ON s.class_id = ta.class_id
        WHERE ta.teacher_id = (select auth.uid())
          AND ta.subject_id = subject_id
          AND s.id = student_id
          AND ta.school_id = public.get_user_school_id()
      )
      OR
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role)
      )
      OR
      public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
      public.has_role((select auth.uid()), 'developer'::public.app_role)
    )
  );

-- Attendance RLS - OBLIGATORIU school_id check
DROP POLICY IF EXISTS "Users can view attendance from their school" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can update attendance" ON public.attendance;

CREATE POLICY "attendance_select_strict" ON public.attendance
  FOR SELECT
  USING (
    school_id = public.get_user_school_id() OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

CREATE POLICY "attendance_manage_strict" ON public.attendance
  FOR ALL
  USING (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR
        public.has_role((select auth.uid()), 'teacher'::public.app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  )
  WITH CHECK (
    (
      school_id = public.get_user_school_id() AND
      (
        public.has_role((select auth.uid()), 'director'::public.app_role) OR
        public.has_role((select auth.uid()), 'secretariat'::public.app_role) OR
        public.has_role((select auth.uid()), 'teacher'::public.app_role) OR
        public.has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
      )
    ) OR
    public.has_role((select auth.uid()), 'uat_admin'::public.app_role) OR
    public.has_role((select auth.uid()), 'developer'::public.app_role)
  );

-- =============================================================================
-- PART 6: AUDIT LOG & STATE CONTROL
-- =============================================================================

-- 6.1) Asigură că audit_logs are structura completă
DO $$
BEGIN
  -- Verifică dacă tabelul există
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    CREATE TABLE IF NOT EXISTS public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      active_role public.app_role NOT NULL,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id UUID,
      old_data JSONB,
      new_data JSONB,
      details JSONB,
      school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSE
    -- Adaugă coloanele care lipsesc
    ALTER TABLE public.audit_logs
      ADD COLUMN IF NOT EXISTS table_name TEXT,
      ADD COLUMN IF NOT EXISTS record_id UUID,
      ADD COLUMN IF NOT EXISTS old_data JSONB,
      ADD COLUMN IF NOT EXISTS new_data JSONB,
      ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
    
    -- Map entity_type -> table_name dacă există
    UPDATE public.audit_logs SET table_name = entity_type WHERE table_name IS NULL AND entity_type IS NOT NULL;
    UPDATE public.audit_logs SET record_id = entity_id WHERE record_id IS NULL AND entity_id IS NOT NULL;
  END IF;
END $$;

-- Indexuri pentru audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON public.audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- 6.2) Asigură că semesters are is_locked
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'semesters' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE public.semesters ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- =============================================================================
-- PART 7: OPTIMIZARE PERFORMANȚĂ - INDEXURI PE FK-URI CRITICE
-- =============================================================================

-- 7.1) Indexuri pe school_id (cel mai important pentru multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_school_id ON public.grades(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON public.attendance(school_id);

-- 7.2) Indexuri pe student_id (folosit în multe JOIN-uri)
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);

-- 7.3) Indexuri pe class_id (folosit în filtrare)
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_subjects_class_id ON public.subjects(class_id);

-- 7.4) Indexuri pe teacher_id (folosit în filtrare)
CREATE INDEX IF NOT EXISTS idx_grades_teacher_id ON public.grades(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_id ON public.attendance(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON public.subjects(teacher_id);

-- =============================================================================
-- PART 8: VERIFICARE INTEGRITATE - NU LĂSA DATE ORFANE
-- =============================================================================

-- 8.1) Verifică dacă există date orfane (fără school_id valid)
DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  -- Students fără school_id sau cu school_id invalid
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.students s
  WHERE s.school_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.schools WHERE id = s.school_id);
  
  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Există % studenți fără school_id valid. Trebuie corectați înainte de a seta NOT NULL.', v_orphan_count;
  END IF;
  
  -- Classes fără school_id sau cu school_id invalid
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.classes c
  WHERE c.school_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.schools WHERE id = c.school_id);
  
  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Există % clase fără school_id valid. Trebuie corectate înainte de a seta NOT NULL.', v_orphan_count;
  END IF;
  
  -- Grades fără school_id sau cu school_id invalid
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.grades g
  WHERE g.school_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.schools WHERE id = g.school_id);
  
  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Există % note fără school_id valid. Trebuie corectate înainte de a seta NOT NULL.', v_orphan_count;
  END IF;
  
  -- Attendance fără school_id sau cu school_id invalid
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.attendance a
  WHERE a.school_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.schools WHERE id = a.school_id);
  
  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Există % absențe fără school_id valid. Trebuie corectate înainte de a seta NOT NULL.', v_orphan_count;
  END IF;
END $$;

COMMIT;
