-- Store student_number as TEXT in format EN-XXXXX (5 digits) for consistency and future-proofing.
-- Existing integer values are converted to EN-XXXXX (e.g. 1 -> EN-00001, 123 -> EN-00123).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'student_number'
  ) THEN
    ALTER TABLE public.students
      ALTER COLUMN student_number TYPE TEXT
      USING (
        CASE
          WHEN student_number IS NULL THEN NULL
          ELSE 'EN-' || LPAD((student_number)::text, 5, '0')
        END
      );
  END IF;
END $$;
