# Consolidare service layer

## Regulă
Nicio componentă UI nu apelează direct `supabase.from(...)`. UI apelează doar: hooks, queries, servicii (*.service.ts).

## Mutări făcute
- **SchoolCalendar**: `createSchoolEvent` + query folosește `fetchSchoolEvents` din `features/calendar/services/schoolEvents.service.ts`.
- **Announcements / CreateAnnouncementDialog**: `createAnnouncement` și `fetchAnnouncements` din `features/announcements/services/announcements.service.ts`.
- **AdminDashboard**: asignare/ștergere roluri prin `addUserRole` / `removeUserRole` din `features/admin/services/user-management.service.ts`.

## Apeluri directe rămase (de mutat în servicii)
- **DirectorDashboard**: `supabase.from('students')`, `classes`, `profiles` (counts) → mutat în service (ex: `directorDashboard.service.ts` sau `global-admin.service`).
- **HomeroomDashboard**: `students.insert`, `classes.insert` → serviciu elevi/clase (ex: `students.service.ts`, deja parțial în alt modul).
- **TakeAttendance**: `classes.select`, `subjects.select`, `teacher_register.insert` → `attendance.service` sau `teacherRegister.service`.
- **TeacherDashboard**: `classes.select`, `subjects.select`, `teacher_register.insert`, `profiles.update` (onboarding_tour) → servicii corespunzătoare.
- **AdminDashboard**: stats (profiles, classes, students, grades, attendance count) → `global-admin.service` sau `admin-stats.service`.
- **Settings**: `schools.select` (nume școală) → `school.service` sau `api/school.service`.
- **Auth**: `students.insert`, `parent_student_relations.insert` la signup → păstrate în flux auth sau mutate în `auth.service` / `onboarding.service`.
- **useAuth**: `user_roles.insert` la claim role → deja logică auth; poate fi extras în `auth.service` sau lăsat în hook cu apel service.

Nu șterge features; mută doar apelurile în servicii și păstrează arhitectura pe features.
