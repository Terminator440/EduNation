
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_student_number integer;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_email text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_phone text;
