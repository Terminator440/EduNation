-- Create RLS policies for developers to access data for debugging
CREATE POLICY "Developers can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));

CREATE POLICY "Developers can view all classes" 
ON public.classes 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));

CREATE POLICY "Developers can view all students" 
ON public.students 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));

CREATE POLICY "Developers can view all grades" 
ON public.grades 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));

CREATE POLICY "Developers can view all attendance" 
ON public.attendance 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));

CREATE POLICY "Developers can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));

CREATE POLICY "Developers can view all user roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));

CREATE POLICY "Developers can view all announcements" 
ON public.announcements 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));

CREATE POLICY "Developers can view all subjects" 
ON public.subjects 
FOR SELECT 
USING (has_role((select auth.uid()), 'developer'::app_role));