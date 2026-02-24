# Backup

## Export data (JSON)

To export a snapshot of the database as JSON:

1. Set environment variables:
   - `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY` (service role key from Supabase Dashboard → Settings → API)

2. Run:

   ```bash
   npx ts-node scripts/export-backup.ts
   ```

   Optional: set `BACKUP_OUTPUT` to a custom path:

   ```bash
   BACKUP_OUTPUT=./backups/backup-2025-02-23.json npx ts-node scripts/export-backup.ts
   ```

3. The script writes a single JSON file containing one key per table (schools, school_years, classes, subjects, profiles, user_roles, students, grades, attendance, invitations, parent_student_relations).

**Note:** Auth users are not exported by this script. Use Supabase Dashboard → Authentication → Users for user export, or Supabase CLI for full project backup.

## Restore

This backup format is for reference and manual restore. To re-import:

- Use Supabase SQL editor or a custom script to insert rows.
- Respect foreign key order (schools → school_years → classes → subjects → profiles → …).
- Auth users must exist in `auth.users` before linking profiles/students/teachers.

## Supabase full backup

For full project backup (including Auth and Storage), use [Supabase Backup](https://supabase.com/docs/guides/platform/backups) or `supabase db dump`.
