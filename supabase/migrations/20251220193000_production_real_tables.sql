-- Production-real tables & policies (calendar events, lessons, messaging, admin visibility)

-- 1) Profiles: allow director/uat_admin to view all profiles (needed for role management dashboards)
DROP POLICY IF EXISTS "Directors can view all profiles" ON public.profiles;
CREATE POLICY "Directors can view all profiles" ON public.profiles
  FOR SELECT USING (
    has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 2) user_roles: allow director/uat_admin to view and manage roles (required for admin tooling)
DROP POLICY IF EXISTS "Staff can view all roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles" ON public.user_roles
  FOR SELECT USING (
    has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

DROP POLICY IF EXISTS "Staff can manage roles" ON public.user_roles;
CREATE POLICY "Staff can manage roles" ON public.user_roles
  FOR ALL USING (
    has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 3) school_events: shared calendar events (tests/homework/events/holidays)
CREATE TABLE IF NOT EXISTS public.school_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  event_time TEXT,
  type TEXT NOT NULL CHECK (type IN ('test','homework','event','holiday')),
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view school events" ON public.school_events;
CREATE POLICY "Authenticated can view school events" ON public.school_events
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Staff can manage school events" ON public.school_events;
CREATE POLICY "Staff can manage school events" ON public.school_events
  FOR ALL USING (
    has_role(auth.uid(), 'secretariat'::app_role) OR
    has_role(auth.uid(), 'director'::app_role) OR
    has_role(auth.uid(), 'uat_admin'::app_role)
  );

-- 4) lessons: minimal lessons/homework/projects (per class)
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in-progress','completed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view lessons for own class" ON public.lessons;
CREATE POLICY "Students can view lessons for own class" ON public.lessons
  FOR SELECT USING (
    class_id IN (SELECT class_id FROM public.students WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Parents can view lessons for linked classes" ON public.lessons;
CREATE POLICY "Parents can view lessons for linked classes" ON public.lessons
  FOR SELECT USING (
    class_id IN (
      SELECT s.class_id
      FROM public.parent_student_relations psr
      JOIN public.students s ON s.id = psr.student_id
      WHERE psr.parent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can manage lessons for their class" ON public.lessons;
CREATE POLICY "Teachers can manage lessons for their class" ON public.lessons
  FOR ALL USING (
    class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'director'::app_role)
  );

-- 5) messages: internal messaging (teacher/staff <-> student/parent)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
CREATE POLICY "Participants can view messages" ON public.messages
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Recipient can mark read" ON public.messages;
CREATE POLICY "Recipient can mark read" ON public.messages
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
