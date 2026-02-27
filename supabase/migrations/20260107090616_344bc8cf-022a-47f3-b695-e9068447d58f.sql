-- =============================================
-- Task 1.1 & 5.2: Indexuri pentru performanță 
-- =============================================

-- Indexuri pe invitations
CREATE INDEX IF NOT EXISTS idx_invitations_school_id ON public.invitations(school_id);
CREATE INDEX IF NOT EXISTS idx_invitations_class_id ON public.invitations(class_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON public.invitations(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON public.invitations(created_at);

-- Indexuri pe students
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);

-- Indexuri pe grades
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_teacher_id ON public.grades(teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_date ON public.grades(date);
CREATE INDEX IF NOT EXISTS idx_grades_created_at ON public.grades(created_at);

-- Indexuri pe attendance
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_id ON public.attendance(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance(status);

-- Indexuri pe audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Indexuri pe classes
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);

-- Indexuri pe announcements
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON public.announcements(created_by);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at);

-- Indexuri pe school_events
CREATE INDEX IF NOT EXISTS idx_school_events_event_date ON public.school_events(event_date);
CREATE INDEX IF NOT EXISTS idx_school_events_class_id ON public.school_events(class_id);

-- Indexuri pe timetable_entries
CREATE INDEX IF NOT EXISTS idx_timetable_class_id ON public.timetable_entries(class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher_id ON public.timetable_entries(teacher_id);

-- =============================================
-- Task 1.2: Extinde audit_logs cu old_data/new_data 
-- =============================================

ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS old_data JSONB,
ADD COLUMN IF NOT EXISTS new_data JSONB,
ADD COLUMN IF NOT EXISTS school_id UUID;

-- Index pentru filtrarea pe school_id în audit
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs(school_id);

-- =============================================
-- Task 2.1: DB constraints pentru invitations
-- =============================================

-- Adaugă trigger pentru validare în loc de CHECK constraint (mai flexibil)
CREATE OR REPLACE FUNCTION public.validate_invitation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validare max_uses >= 1
  IF NEW.max_uses < 1 THEN
    RAISE EXCEPTION 'max_uses trebuie să fie cel puțin 1';
  END IF;
  
  -- Validare current_uses >= 0
  IF NEW.current_uses < 0 THEN
    RAISE EXCEPTION 'current_uses nu poate fi negativ';
  END IF;
  
  -- Validare current_uses <= max_uses
  IF NEW.current_uses > NEW.max_uses THEN
    RAISE EXCEPTION 'current_uses nu poate depăși max_uses';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger pentru validare la INSERT/UPDATE
DROP TRIGGER IF EXISTS trigger_validate_invitation ON public.invitations;
CREATE TRIGGER trigger_validate_invitation
  BEFORE INSERT OR UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invitation();

-- =============================================
-- RLS: Adaugă policy pentru secretariat pe audit_logs
-- =============================================

DROP POLICY IF EXISTS "Secretariat can view school audit logs" ON public.audit_logs;
CREATE POLICY "Secretariat can view school audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    has_role((select auth.uid()), 'secretariat'::app_role) OR
    has_role((select auth.uid()), 'homeroom_teacher'::app_role)
  );

-- =============================================
-- RLS: Parents can view their children's data
-- =============================================

-- Grades: Parents can view their children's grades
DROP POLICY IF EXISTS "Parents can view children grades" ON public.grades;
CREATE POLICY "Parents can view children grades"
  ON public.grades
  FOR SELECT
  USING (
    student_id IN (
      SELECT psr.student_id 
      FROM public.parent_student_relations psr 
      WHERE psr.parent_user_id = (select auth.uid())
    )
  );

-- Attendance: Parents can view their children's attendance
DROP POLICY IF EXISTS "Parents can view children attendance" ON public.attendance;
CREATE POLICY "Parents can view children attendance"
  ON public.attendance
  FOR SELECT
  USING (
    student_id IN (
      SELECT psr.student_id 
      FROM public.parent_student_relations psr 
      WHERE psr.parent_user_id = (select auth.uid())
    )
  );

-- Students: Parents can view their children's student records
DROP POLICY IF EXISTS "Parents can view children records" ON public.students;
CREATE POLICY "Parents can view children records"
  ON public.students
  FOR SELECT
  USING (
    id IN (
      SELECT psr.student_id 
      FROM public.parent_student_relations psr 
      WHERE psr.parent_user_id = (select auth.uid())
    )
  );

-- =============================================
-- Funcție îmbunătățită pentru audit logging
-- =============================================

CREATE OR REPLACE FUNCTION public.log_audit_extended(
  _user_id UUID,
  _user_name TEXT,
  _active_role app_role,
  _action TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL,
  _old_data JSONB DEFAULT NULL,
  _new_data JSONB DEFAULT NULL,
  _school_id UUID DEFAULT NULL,
  _details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    user_id, user_name, active_role, action, 
    entity_type, entity_id, old_data, new_data, school_id, details
  )
  VALUES (
    _user_id, _user_name, _active_role, _action,
    _entity_type, _entity_id, _old_data, _new_data, _school_id, _details
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;