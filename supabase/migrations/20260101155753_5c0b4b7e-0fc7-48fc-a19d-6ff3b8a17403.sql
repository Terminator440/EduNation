-- Create announcements table for school-wide announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  target_role TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Directors, secretariat and uat_admin can create announcements
CREATE POLICY "Staff can create announcements" 
ON public.announcements 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'director'::app_role) OR 
  has_role(auth.uid(), 'secretariat'::app_role) OR 
  has_role(auth.uid(), 'uat_admin'::app_role)
);

-- Directors, secretariat and uat_admin can update/delete their announcements
CREATE POLICY "Staff can manage their announcements" 
ON public.announcements 
FOR ALL 
USING (
  created_by = auth.uid() AND (
    has_role(auth.uid(), 'director'::app_role) OR 
    has_role(auth.uid(), 'secretariat'::app_role) OR 
    has_role(auth.uid(), 'uat_admin'::app_role)
  )
);

-- Everyone can view announcements (filtered by target_role in app)
CREATE POLICY "Anyone can view announcements" 
ON public.announcements 
FOR SELECT 
USING (true);