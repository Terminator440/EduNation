-- Consolidation: Ensure audit triggers on all target tables
-- Run after 20260213* migrations - guarantees grades, attendance, teacher_register, disciplinary_actions, academic_year are audited

BEGIN;

-- Ensure audit_row_change exists (from 20260213000200) and attach triggers
-- Grades
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Attendance
DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Teacher register (condica)
DROP TRIGGER IF EXISTS trg_audit_teacher_register ON public.teacher_register;
CREATE TRIGGER trg_audit_teacher_register
  AFTER INSERT OR UPDATE OR DELETE ON public.teacher_register
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Disciplinary actions and academic_year already have triggers from 20260213000200

COMMIT;
