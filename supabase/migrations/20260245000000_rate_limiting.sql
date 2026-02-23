-- Rate limiting: înregistrare încercări login și limită apeluri API.
-- Implementare: tabel + RPC. Blocarea efectivă la login se poate face în Edge Function / Auth hook.

-- Încercări login (email sau identifier) – pentru limit login attempts
CREATE TABLE IF NOT EXISTS public.rate_limit_login (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_login_identifier_at
  ON public.rate_limit_login(identifier, attempted_at DESC);

-- Limită: max 10 încercări eșuate în ultimele 15 minute per identifier
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failures int;
BEGIN
  SELECT count(*)::int INTO v_failures
  FROM public.rate_limit_login
  WHERE identifier = p_identifier
    AND success = false
    AND attempted_at > now() - interval '15 minutes';
  RETURN v_failures < 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_login_attempt(p_identifier text, p_success boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rate_limit_login (identifier, success)
  VALUES (p_identifier, p_success);
  -- Curățare vechi (păstrăm ultimele 24h)
  DELETE FROM public.rate_limit_login
  WHERE attempted_at < now() - interval '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_login_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt TO anon, authenticated;

-- RLS: doar service role sau backend ar trebui să insereze; pentru simplificare permitem authenticated să înregistreze (apelat după login fail)
ALTER TABLE public.rate_limit_login ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limit_login_insert_anon"
  ON public.rate_limit_login FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "rate_limit_login_insert_authenticated"
  ON public.rate_limit_login FOR INSERT TO authenticated
  WITH CHECK (true);

-- Select/delete doar pentru service (cron cleanup)
CREATE POLICY "rate_limit_login_select_authenticated"
  ON public.rate_limit_login FOR SELECT TO authenticated
  USING (false);

COMMENT ON TABLE public.rate_limit_login IS 'Rate limiting: încercări login; check_login_rate_limit și record_login_attempt.';
