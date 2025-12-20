-- Allow homeroom teachers and secretariat to create classes
CREATE POLICY "Homeroom teachers can create their class"
ON public.classes
FOR INSERT
WITH CHECK (
  teacher_id = auth.uid() AND 
  (has_role(auth.uid(), 'homeroom_teacher') OR has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'))
);

-- Allow secretariat and director to manage all classes
CREATE POLICY "Secretariat can manage all classes"
ON public.classes
FOR ALL
USING (has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'));

-- Allow secretariat and director to view all students
CREATE POLICY "Secretariat can view all students"
ON public.students
FOR SELECT
USING (has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'));

-- Allow secretariat and director to manage all students
CREATE POLICY "Secretariat can manage all students"
ON public.students
FOR ALL
USING (has_role(auth.uid(), 'secretariat') OR has_role(auth.uid(), 'director'));