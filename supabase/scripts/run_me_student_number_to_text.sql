-- Rulează acest script în Supabase → SQL Editor pentru a schimba permanent
-- coloana student_number la TEXT și a converti valorile existente la format EN-XXXXX.
-- O singură execuție; idempotent (dacă coloana e deja TEXT, nu face nimic).

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'student_number';

  IF col_type = 'integer' THEN
    ALTER TABLE public.students
      ALTER COLUMN student_number TYPE TEXT
      USING (
        CASE
          WHEN student_number IS NULL THEN NULL
          ELSE 'EN-' || LPAD((student_number)::text, 5, '0')
        END
      );
    RAISE NOTICE 'Coloana public.students.student_number a fost schimbată la TEXT.';
  ELSE
    RAISE NOTICE 'Coloana student_number este deja de tip % - nu se modifică nimic.', col_type;
  END IF;
END $$;
