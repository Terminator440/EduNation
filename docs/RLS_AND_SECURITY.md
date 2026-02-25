# RLS și securitate

## Obiectiv
Imposibilitate escaladare roluri sau acces cross-school. Toate politicile RLS trebuie să folosească `auth.uid()` și, unde e cazul, verificare pe `school_id`.

## Tabele critice și politici

### Profiluri și roluri
- **profiles**: SELECT/UPDATE doar pentru `id = auth.uid()` sau rol director/secretariat în școala respectivă (`school_id = get_user_school_id()`).
- **user_roles**: INSERT/DELETE doar pentru utilizatori din aceeași școală; SELECT filtrat pe `school_id` sau rol global (uat_admin).

### Date școlare
- **schools**: SELECT pentru școala utilizatorului (`profiles.school_id`) sau uat_admin.
- **classes**, **students**, **subjects**: toate cu `school_id = public.get_user_school_id()` în politici.
- **grades**, **attendance**: RLS strict; scrieri doar prin RPC (`add_grade`, `mark_attendance`) care verifică `get_user_school_id()` și asignarea profesorului.

### Facturare
- **invoices**: SELECT/UPDATE doar pentru `school_id` al școlii utilizatorului sau super admin.

### Evenimente și anunțuri
- **school_events**: politici „school_events_select_strict” și „school_events_manage_strict” – folosesc `school_id = get_user_school_id()` și `has_role(auth.uid(), ...)`.
- **announcements**: INSERT/UPDATE/DELETE doar pentru director/secretariat/uat_admin; SELECT pentru autentificați.

## Funcții helper
- `public.get_user_school_id()`: returnează `school_id` din `profiles` pentru `auth.uid()`. Folosit în toate politicile per-școală.
- `public.has_role(auth.uid(), role)`: verificare rol pentru politici.

## Migrări
Politicile sunt definite/actualizate în migrările din `supabase/migrations/`. Comentariile SQL explicative sunt în fișierele respectivelor migrații (ex: `20260230000000_ten_critical_backend_security.sql`).

## Audit
Tabelul `audit_log` (migrarea `20260235000000_production_audit_log_and_rpc.sql`) înregistrează INSERT/UPDATE/DELETE pe grades și attendance prin trigger; `changed_by` = `auth.uid()`.
