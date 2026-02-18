-- Migration: Tickets – simple parent-to-teacher messaging
-- Parents can send messages (tickets) linked to a student_id to teachers or homeroom teacher
-- Teachers receive a notification when they get a new ticket

BEGIN;

-- ============================================================================
-- PART 1: TICKETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tickets IS 'Parent-to-teacher/diriginte messages linked to a student.';
COMMENT ON COLUMN public.tickets.student_id IS 'Student the message is about (parent must be linked via parent_student_relations).';
COMMENT ON COLUMN public.tickets.from_user_id IS 'Parent who sent the message.';
COMMENT ON COLUMN public.tickets.to_user_id IS 'Teacher or homeroom teacher who receives the message.';

CREATE INDEX IF NOT EXISTS idx_tickets_to_user_created ON public.tickets(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_from_user_created ON public.tickets(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_student_id ON public.tickets(student_id);
CREATE INDEX IF NOT EXISTS idx_tickets_school_id ON public.tickets(school_id);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Parents: can insert tickets only for their children (student_id in parent_student_relations)
CREATE POLICY "Parents can create tickets for their children"
  ON public.tickets FOR INSERT
  WITH CHECK (
    auth.uid() = from_user_id
    AND school_id = public.get_user_school_id()
    AND EXISTS (
      SELECT 1 FROM public.parent_student_relations psr
      WHERE psr.student_id = tickets.student_id
        AND psr.parent_user_id = auth.uid()
    )
  );

-- Parents: can select tickets they sent
CREATE POLICY "Parents can view their sent tickets"
  ON public.tickets FOR SELECT
  USING (
    from_user_id = auth.uid()
    AND school_id = public.get_user_school_id()
  );

-- Teachers/diriginte: can select tickets addressed to them
CREATE POLICY "Teachers can view tickets sent to them"
  ON public.tickets FOR SELECT
  USING (
    to_user_id = auth.uid()
    AND school_id = public.get_user_school_id()
  );

-- Teachers: can update only to set read_at (mark as read)
CREATE POLICY "Teachers can update tickets sent to them (mark read)"
  ON public.tickets FOR UPDATE
  USING (to_user_id = auth.uid() AND school_id = public.get_user_school_id())
  WITH CHECK (to_user_id = auth.uid());

-- Staff/admin: can view all tickets of their school (optional, for support)
CREATE POLICY "Staff can view all school tickets"
  ON public.tickets FOR SELECT
  USING (
    school_id = public.get_user_school_id()
    AND (
      public.has_role(auth.uid(), 'director'::app_role)
      OR public.has_role(auth.uid(), 'secretariat'::app_role)
    )
  );

-- Trigger: set updated_at
CREATE OR REPLACE FUNCTION public.set_tickets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.tickets;
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_tickets_updated_at();

-- ============================================================================
-- PART 2: NOTIFICATION WHEN TICKET IS CREATED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name TEXT;
  v_sender_name TEXT;
  v_message TEXT;
BEGIN
  SELECT full_name INTO v_student_name
  FROM public.students WHERE id = NEW.student_id;

  SELECT full_name INTO v_sender_name
  FROM public.profiles WHERE id = NEW.from_user_id;

  v_message := COALESCE(v_sender_name, 'Un părinte') || ' a trimis un mesaj despre ' || COALESCE(v_student_name, 'elev');

  INSERT INTO public.notifications (user_id, type, title, message, is_read, link)
  VALUES (
    NEW.to_user_id,
    'ticket',
    'Mesaj nou de la părinte',
    v_message,
    false,
    '/teacher/tickets'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_created ON public.tickets;
CREATE TRIGGER trg_notify_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_created();

COMMIT;
