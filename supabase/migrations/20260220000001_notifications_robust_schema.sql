-- Schema robust pentru notifications: message, link, is_read, type
-- RLS: utilizator vede/marchează doar ale lui; director/teacher pot insera

-- Adaugă coloane noi dacă lipsesc (compatibilitate cu schema existentă)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Migrare: copiază body în message dacă message e gol
UPDATE public.notifications
SET message = COALESCE(body, title, '')
WHERE message IS NULL AND (body IS NOT NULL OR title IS NOT NULL);

-- Sincronizează is_read din read_at
UPDATE public.notifications
SET is_read = (read_at IS NOT NULL)
WHERE read_at IS NOT NULL;

-- Șterge politicile vechi pentru a le recrea
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;

-- SELECT: utilizatorul vede doar propriile notificări
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT USING (user_id = (select auth.uid()));

-- UPDATE: utilizatorul poate marca doar propriile notificări ca citite
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- INSERT: utilizatorul (rar) sau director/teacher pot insera
-- Service role bypass-ează RLS, deci sistemul poate insera oricum
CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Staff insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    has_role((select auth.uid()), 'director'::public.app_role)
    OR has_role((select auth.uid()), 'teacher'::public.app_role)
    OR has_role((select auth.uid()), 'homeroom_teacher'::public.app_role)
    OR has_role((select auth.uid()), 'secretariat'::public.app_role)
    OR has_role((select auth.uid()), 'uat_admin'::public.app_role)
  );

-- Activează Realtime pentru notifications (Dashboard > Database > Replication)
-- Dacă nu merge, adaugă manual tabela notifications în supabase_realtime
