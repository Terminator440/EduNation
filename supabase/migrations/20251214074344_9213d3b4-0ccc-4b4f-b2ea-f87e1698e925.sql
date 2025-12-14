
-- Fix search_path for generate_activation_code function
CREATE OR REPLACE FUNCTION public.generate_activation_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code TEXT;
BEGIN
  code := upper(substr(md5(random()::text), 1, 8));
  RETURN code;
END;
$$;
