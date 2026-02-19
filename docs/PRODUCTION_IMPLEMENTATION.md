# Implementare production-grade – Locația fișierelor și rezumat

## 1. Migrații SQL

| Fișier | Conținut |
|--------|----------|
| `supabase/migrations/20260235000000_production_audit_log_and_rpc.sql` | `audit_log`, trigger-e pe grades/attendance, `academic_periods`, `login_logs`, `access_logs`, coloane `created_by`/`updated_by` |
| `supabase/migrations/20260235100000_production_rpc_grade_attendance.sql` | RPC: `add_grade`, `update_grade`, `delete_grade`, `mark_attendance`, `mark_attendance_upsert`, `delete_attendance`, `calculate_student_average` |
| `supabase/migrations/20260236000000_schema_reporting_logging.sql` | View `users`, `user_roles.school_id`, `add_grade` cu `grade_type`, `get_student_report`, `get_class_report`, `log_login`, `log_access` |

## 2. RPC-uri (toate în migrații)

- **Note**: `add_grade`, `update_grade`, `delete_grade` (soft delete), `calculate_student_average`
- **Prezență**: `mark_attendance` (upsert), `mark_attendance_upsert`, `delete_attendance`
- **Raportare**: `get_student_report`, `get_class_report`
- **Logging**: `log_login`, `log_access` (apelate din Edge Function sau din client după login)

## 3. RLS

Politicile RLS pentru grades, attendance, students, profiles etc. sunt deja în migrațiile existente (ex.: `20260223000000_soft_delete_grades_attendance_rls.sql`, `20260222000003_rls_security_audit_students_grades.sql`). Nu se scriu direct în tabele din frontend; mutațiile merg prin RPC.

## 4. Frontend – servicii (doar RPC pentru mutații)

| Fișier | Rol |
|--------|-----|
| `src/features/grades/services/grades.service.ts` | `addGrade`, `updateGrade`, `deleteGrade` apelează RPC; citiri prin `supabase.from("grades").select()` |
| `src/features/attendance/services/attendance.service.ts` | `addAttendance`, `updateAttendance`, `deleteAttendance` apelează `mark_attendance` / `delete_attendance` |
| `src/features/reports/services/reports.service.ts` | `fetchStudentReport`, `fetchClassReport` – apelează `get_student_report`, `get_class_report` |

## 5. Frontend – hooks

| Fișier | Exporturi |
|--------|-----------|
| `src/features/grades/hooks/index.ts` | `useGrades` (= `useGradesForScope`), `useAddGrade`, `useUpdateGrade`, `useDeleteGrade` |
| `src/features/attendance/hooks/index.ts` | `useAttendance` (= `useAttendanceForScope`), `useAddAttendance`, `useUpdateAttendance`, `useDeleteAttendance` |
| `src/features/grades/queries.ts` | Implementarea mutațiilor grades (folosită de hooks) |
| `src/features/attendance/queries.ts` | Implementarea mutațiilor attendance |
| `src/features/academics/queries.ts` | `useGradesForScope`, `useAttendanceForScope` (citiri) |

## 6. Raportare și export PDF

| Fișier | Rol |
|--------|-----|
| `src/features/reports/services/reports.service.ts` | RPC `get_student_report`, `get_class_report` |
| `src/utils/exportStudentReportPdf.ts` | PDF raport elev (note, absențe, medii) din payload RPC |
| `src/utils/exportClassReportPdf.ts` | PDF raport clasă (elevi, medii, absențe) din payload RPC |
| `src/pages/Reports.tsx` | Butoane „Raport elev PDF” și „Raport clasă PDF” care apelează serviciul și exportă PDF |

## 7. Offline (coadă, retry, conflict)

| Fișier | Rol |
|--------|-----|
| `src/lib/offlineQueueDb.ts` | IndexedDB: `addToOfflineQueue`, `getOfflineQueue`, `removeFromOfflineQueue` |
| `src/contexts/OfflineQueueContext.tsx` | Procesare coadă: retry 3 pași cu backoff, conflict detection, invalidare query-uri după succes |

## 8. Logging autentificare

| Fișier | Rol |
|--------|-----|
| `supabase/functions/log-auth-event/index.ts` | Edge Function: primește `email`, `success`, `user_id` și apelează RPC `log_login` (service_role) |
| `src/lib/logAuth.ts` | `logLoginEvent({ email, success, user_id? })` – face POST la Edge Function |
| `src/hooks/useAuth.tsx` | După `signInWithPassword`: apelează `logLoginEvent` la succes și la eșec |

## 9. Roluri și permisiuni

- Rolurile sunt în DB: `user_roles` (plus `profiles.active_role` pentru UI).
- Verificările de permisiuni se fac în RPC (`user_can_edit_grade`, `has_role`, `get_user_school_id`) și în RLS.
- Blocarea semestrului: `academic_periods.is_locked` și `is_semester_locked_for_grade` în RPC.

## 10. Validare

- Validare server-side în toate RPC-urile (note 1–10, UUID-uri, school_id, asignare profesor etc.).
- Frontend poate valida pentru UX, dar autorizarea și regulile de business sunt doar în backend.
