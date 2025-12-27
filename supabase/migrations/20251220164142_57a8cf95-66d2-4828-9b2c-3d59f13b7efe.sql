-- Allow homeroom teachers and secretariat to create classes
DROP POLICY IF EXISTS "Homeroom teachers can create their class" ON public.classes;
CREATE POLICY "Homeroom teachers can create their class"
ON public.classes
FOR INSERT
WITH CHECK (
  teacher_id = auth.uid() AND 
  (has_role(auth.uid(), 'homeroom_teacher') OR has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'))
);

-- Allow secretariat and director to manage all classes
DROP POLICY IF EXISTS "Secretariat can manage all classes" ON public.classes;
CREATE POLICY "Secretariat can manage all classes"
ON public.classes
FOR ALL
USING (has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'));

-- Allow secretariat and director to view all students
DROP POLICY IF EXISTS "Secretariat can view all students" ON public.students;
CREATE POLICY "Secretariat can view all students"
ON public.students
FOR SELECT
USING (has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'));

-- Allow secretariat and director to manage all students
DROP POLICY IF EXISTS "Secretariat can manage all students" ON public.students;
CREATE POLICY "Secretariat can manage all students"
ON public.students
FOR ALL
USING (has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'));