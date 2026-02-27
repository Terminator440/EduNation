-- Create timetable_entries table for schedule/orar
CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID,
  weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  period INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  room TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

-- Everyone can view timetable (it's public school data)
CREATE POLICY "Anyone can view timetable"
  ON public.timetable_entries
  FOR SELECT
  USING (true);

-- Teachers can manage their own timetable entries
CREATE POLICY "Teachers can manage own timetable entries"
  ON public.timetable_entries
  FOR ALL
  USING (teacher_id = auth.uid());

-- Secretariat/Director can manage all timetable entries
CREATE POLICY "Staff can manage all timetable entries"
  ON public.timetable_entries
  FOR ALL
  USING (has_role(auth.uid(), 'secretariat'::app_role) OR has_role(auth.uid(), 'director'::app_role));

-- Developers can view all
CREATE POLICY "Developers can view all timetable entries"
  ON public.timetable_entries
  FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));


-- Create school_events table for calendar
CREATE TABLE IF NOT EXISTS public.school_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_date DATE NOT NULL,
  event_time TEXT,
  type TEXT NOT NULL CHECK (type IN ('holiday', 'event', 'test', 'homework')),
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

-- Everyone can view events (public school calendar)
CREATE POLICY "Anyone can view school events"
  ON public.school_events
  FOR SELECT
  USING (true);

-- Teachers can create events for their classes
CREATE POLICY "Teachers can create events"
  ON public.school_events
  FOR INSERT
  WITH CHECK (created_by = auth.uid() AND (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'homeroom_teacher'::app_role)));

-- Teachers can manage their own events
CREATE POLICY "Teachers can manage own events"
  ON public.school_events
  FOR ALL
  USING (created_by = auth.uid());

-- Secretariat/Director can manage all events
CREATE POLICY "Staff can manage all events"
  ON public.school_events
  FOR ALL
  USING (has_role(auth.uid(), 'secretariat'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'uat_admin'::app_role));

-- Developers can view all
CREATE POLICY "Developers can view all school events"
  ON public.school_events
  FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));