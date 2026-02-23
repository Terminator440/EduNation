-- =============================================================================
-- Billing anual: 60 lei/elev/an. Factură manuală, fără plăți online.
-- =============================================================================

BEGIN;

-- 1) school_billing – config preț per școală
CREATE TABLE IF NOT EXISTS public.school_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  price_per_student NUMERIC(10,2) NOT NULL DEFAULT 60,
  currency TEXT NOT NULL DEFAULT 'RON',
  billing_cycle TEXT NOT NULL DEFAULT 'yearly' CHECK (billing_cycle IN ('yearly')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id)
);

CREATE INDEX IF NOT EXISTS idx_school_billing_school_id ON public.school_billing(school_id);

-- 2) subscriptions – status per școală / an
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'canceled')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  billing_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, billing_year)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_school_year ON public.subscriptions(school_id, billing_year);

-- 3) invoices – o factură per școală per an
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  billing_year INTEGER NOT NULL,
  student_count INTEGER NOT NULL,
  price_per_student NUMERIC(10,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'canceled')),
  issued_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, billing_year)
);

CREATE INDEX IF NOT EXISTS idx_invoices_school_year ON public.invoices(school_id, billing_year);

ALTER TABLE public.school_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS: doar director/uat_admin/developer văd facturile și billing-ul
CREATE POLICY "billing_select_admin" ON public.school_billing FOR SELECT
  USING (public.get_user_school_id() = school_id OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "subscriptions_select_admin" ON public.subscriptions FOR SELECT
  USING (public.get_user_school_id() = school_id OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "invoices_select_admin" ON public.invoices FOR SELECT
  USING (public.get_user_school_id() = school_id OR public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));

-- Super admin poate gestiona orice
CREATE POLICY "billing_all_super_admin" ON public.school_billing FOR ALL
  USING (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "subscriptions_all_super_admin" ON public.subscriptions FOR ALL
  USING (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "invoices_all_super_admin" ON public.invoices FOR ALL
  USING (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));

-- Numără elevii activi ai școlii (is_active = true sau NULL; folosim school_id din students)
CREATE OR REPLACE FUNCTION public.count_active_students_for_school(p_school_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.students s
  WHERE s.school_id = p_school_id
    AND (s.is_active IS NULL OR s.is_active = true);
$$;

-- Generează factură pentru școală și an (o singură factură per an)
CREATE OR REPLACE FUNCTION public.generate_invoice(p_school_id UUID, p_year INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_price NUMERIC(10,2);
  v_total NUMERIC(12,2);
  v_invoice_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role)) THEN
    RAISE EXCEPTION 'Only super admin can generate invoices';
  END IF;

  v_count := public.count_active_students_for_school(p_school_id);
  SELECT COALESCE(sb.price_per_student, 60) INTO v_price
  FROM public.school_billing sb
  WHERE sb.school_id = p_school_id AND sb.is_active = true
  LIMIT 1;
  IF v_price IS NULL THEN
    v_price := 60;
  END IF;
  v_total := v_count * v_price;

  INSERT INTO public.invoices (school_id, billing_year, student_count, price_per_student, total_amount, status)
  VALUES (p_school_id, p_year, v_count, v_price, v_total, 'pending')
  ON CONFLICT (school_id, billing_year) DO UPDATE SET
    student_count = EXCLUDED.student_count,
    price_per_student = EXCLUDED.price_per_student,
    total_amount = EXCLUDED.total_amount,
    status = CASE WHEN public.invoices.status = 'paid' THEN 'paid' ELSE 'pending' END,
    issued_at = now()
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

-- Marchează factura ca plătită
CREATE OR REPLACE FUNCTION public.mark_invoice_paid(p_invoice_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_year INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'uat_admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role)) THEN
    RAISE EXCEPTION 'Only super admin can mark invoices paid';
  END IF;

  UPDATE public.invoices
  SET status = 'paid', paid_at = now()
  WHERE id = p_invoice_id AND status = 'pending'
  RETURNING school_id, billing_year INTO v_school_id, v_year;

  IF FOUND THEN
    INSERT INTO public.subscriptions (school_id, status, start_date, end_date, billing_year)
    VALUES (v_school_id, 'active', (v_year || '-09-01')::date, (v_year + 1 || '-08-31')::date, v_year)
    ON CONFLICT (school_id, billing_year) DO UPDATE SET status = 'active';
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

COMMIT;
