-- =============================================================================
-- Tighten RLS on public.rate_limit_login
-- -----------------------------------------------------------------------------
-- Context: the original policies (20260245000000_rate_limiting.sql) allowed any
-- anon OR authenticated client to INSERT arbitrary rows with WITH CHECK (true).
-- Because login attempts are keyed by `identifier` (the email), this let anyone
-- insert failed-attempt rows for a victim's email and lock that account out for
-- 15 minutes (denial of service), or flood the table.
--
-- The application never writes to this table directly: it goes through the
-- SECURITY DEFINER RPCs public.record_login_attempt() and
-- public.check_login_rate_limit(), which bypass RLS. So the permissive direct
-- INSERT policies are unnecessary. Removing them forces every write through the
-- controlled RPC path (defense in depth) without changing app behaviour.
-- =============================================================================

DROP POLICY IF EXISTS "rate_limit_login_insert_anon" ON public.rate_limit_login;
DROP POLICY IF EXISTS "rate_limit_login_insert_authenticated" ON public.rate_limit_login;

-- Direct table privileges are not needed by clients; the SECURITY DEFINER RPCs
-- own all reads/writes. Revoke any inherited direct DML grants to be safe.
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_login FROM anon, authenticated;

-- SELECT remains denied to clients (existing policy USING (false) stays in place);
-- RLS stays enabled so no row is directly readable/writable by clients.
ALTER TABLE public.rate_limit_login ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rate_limit_login IS
  'Rate limiting login attempts. Writes ONLY via SECURITY DEFINER RPC record_login_attempt(); reads via check_login_rate_limit(). No direct client DML (RLS-locked).';
