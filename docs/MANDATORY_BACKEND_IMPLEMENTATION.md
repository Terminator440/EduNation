# Implementări obligatorii în backend

Migrarea `20260252000000_mandatory_backend_security.sql` implementează cerințele de securitate și integritate.

## 1. Eliminare USING (true)

- **schools**: `USING (true)` înlocuit cu politică strictă – utilizatorul vede doar propria școală (`profiles.school_id`) sau uat_admin/developer văd toate
- **roles**: Doar director, secretariat, uat_admin, developer pot citi tabelul de referință
- **feature_flags**: Doar utilizatori autentificați

## 2. Prevenire escaladare roluri (user_roles)

- **User NU poate modifica propriul rol**: `user_id != auth.uid()` în INSERT/UPDATE/DELETE
- **Staff NU poate crea uat_admin sau developer**: Director/secretariat pot adăuga doar roluri non-admin
- **Doar uat_admin/developer** pot promova la uat_admin sau developer

## 3. Indexuri

- `idx_profiles_school_id`, `idx_user_roles_user_id`
- `idx_invitations_code_hash`, `idx_invitations_school_id`, `idx_invitations_expires_at`, `idx_invitations_is_used`
- `idx_grades_created_at`, `idx_attendance_created_at`
- `idx_audit_logs_user_id`, `idx_audit_logs_created_at`

## 4. Invitații

- Coloane `is_used`, `expires_at` adăugate dacă lipseau
- RPC `create_invitation` și `claim_invitation` deja verifică `is_used` și `expires_at`

## 5. Soft delete

- `deleted_at` pe `schools`, `classes`, `profiles` (dacă lipsea)
- `profiles.deleted_at` exista deja din GDPR migration

## 6. Audit pentru user_roles

- Trigger `trg_audit_user_roles` pe INSERT/UPDATE/DELETE – scrie în `audit_logs` cu old_data, new_data

## Ce exista deja în migrații anterioare

- **CHECK constraints**: grades 1–10, attendance status (20260220000000, 20260230000000)
- **Semester lock**: `is_locked` pe semesters, verificare în RLS (20260230000000, 20260221000002)
- **Audit logs**: Tabel și trigger-e pe grades, attendance (20260235000000, 20260225000000)
- **RPC**: create_invitation, claim_invitation, close_semester, add_grade, mark_attendance, etc.
- **FOREIGN KEY**: grades→students, students→classes, classes→schools (20260226000000)
- **RLS strict**: Pe grades, attendance, students, classes, subjects (20260220000000, 20260230000000)

## Bootstrap admin (uat_admin)

Politica nu permite utilizatorului să-și adauge singur rolul `uat_admin` sau `developer` prin `addUserRole`.

RPC `ensure_bootstrap_admin_role()`: permite primul uat_admin pentru email-uri din whitelist-ul hardcodat. useAuth apelează acest RPC în loc de addUserRole când `metaRole === 'uat_admin'` și email-ul e în `VITE_BOOTSTRAP_ADMIN_EMAILS`.

**Personalizare whitelist**: Modifică `v_bootstrap_emails` în funcția `ensure_bootstrap_admin_role` (migrarea 20260252000000) pentru a adăuga email-urile admin de producție. Valori implicite: `admin@eduro.local`, `admin@demo.com`.

## Aplicare migrare

```bash
npx supabase db push
# sau
npx supabase migration up
```

Necesită `SUPABASE_DB_URL` sau `SUPABASE_DB_PASSWORD` setat pentru conexiune locală.
