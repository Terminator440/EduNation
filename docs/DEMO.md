# Demo Mode

## Demo accounts

| Rol    | Email            | Parolă   |
|--------|------------------|----------|
| Admin  | admin@demo.com   | Demo123! |
| Teacher| teacher@demo.com | Demo123! |
| Parent | parent@demo.com  | Demo123! |

## Setup demo data

1. **Run migrations** (if not already):
   ```bash
   supabase db push
   ```

2. **Seed demo school and structure** (optional; creates demo school, classes, subjects):
   ```bash
   psql $DATABASE_URL -f supabase/seed-demo.sql
   ```
   Or in Supabase SQL Editor: paste and run the contents of `supabase/seed-demo.sql`.

3. **Create demo users** in Supabase Dashboard:
   - Authentication → Users → Add user
   - Create each: admin@demo.com, teacher@demo.com, parent@demo.com with password `Demo123!`
   - Then in Table Editor → `profiles`: set `school_id` to the demo school ID for each user.
   - In `user_roles`: add the corresponding role (director, teacher, parent) for each user.

4. **Login**: On the login page, use the "Admin" / "Teacher" / "Parent" buttons to autofill credentials, then click "Intră în cont".

## Protection

- Demo accounts (email ending with @demo.com) cannot be deleted from the Settings → Date și cont page.
- Deleting the demo school is blocked in the app when the school name is identified as demo.
