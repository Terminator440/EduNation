# Consolidare service layer

## Regulă
Nicio componentă UI nu apelează direct `supabase.from(...)`. UI apelează doar: hooks, queries, servicii (*.service.ts).

## Mutări făcute
- **SchoolCalendar**: `createSchoolEvent` + `fetchSchoolEvents` din `features/calendar/services/schoolEvents.service.ts`.
- **Announcements / CreateAnnouncementDialog**: `createAnnouncement` și `fetchAnnouncements` din `features/announcements/services/announcements.service.ts`.
- **AdminDashboard**: asignare/ștergere roluri prin `addUserRole` / `removeUserRole`; stats prin `fetchGlobalStats`; users prin `fetchAllUsersForAdmin` din `global-admin.service` și `user-management.service`.
- **DirectorDashboard**: stats, audit, grades distribution prin `fetchDirectorStats`; announcements prin `fetchRecentAnnouncementsForSchool`.
- **HomeroomDashboard**: `addStudent`, `createClass`, `fetchAbsencesForClass`, `motivateAbsences` din `features/homeroom/services/homeroom.service`.
- **TakeAttendance**: `fetchTimetableEntriesForTeacher`, `fetchClassesByIds`, `fetchSubjectsByIds`, `fetchRegisterForTeacher`, `fetchStudentsByClass`, `signRegister`, `saveAttendanceBulk`, `fetchAttendanceBySubjectAndDate` din `teacherRegister.service` și `attendance.service`.
- **Settings**: `getSchoolName` din `features/schools/services/schools.service`.
- **Auth**: `createStudentOnSignup`, `createParentStudentRelation` din `features/auth/services/authOnboarding.service`.
- **useAuth**: `addUserRole` din `user-management.service` la claim role.

## Apeluri directe rămase (opțional)
- **TeacherDashboard**: mutat – folosește `teacherRegister.service`, `profiles.service`.
- **Developer.tsx**: apeluri de test – lăsate pentru dev tool.
- **HomeroomDashboard**: mutat – `fetchHomeroomDashboardData`, `generateStudentActivationCode` din `homeroom.service`.

## Limit / Paginare
- `fetchAnnouncements`: limit 100 (implicit)
- `fetchAllUsersForAdmin`: limit 500
- `user-management.fetchUsers`: paginare (page, pageSize)
