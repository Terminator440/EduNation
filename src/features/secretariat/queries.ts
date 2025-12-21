import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { assertSupabaseOk } from '@/lib/supabase-helpers';

export type ClassRow = {
  id: string;
  name: string;
  year: number;
  section: string;
  teacher_id: string | null;
};

export type StudentListRow = {
  id: string;
  full_name: string | null;
  is_active: boolean | null;
  class: { id: string; name: string; year: number; section: string } | null;
};

export const useClasses = () =>
  useQuery({
    queryKey: ['classes'],
    queryFn: async (): Promise<ClassRow[]> => {
      const res = await supabase.from('classes').select('id,name,year,section,teacher_id').order('year', { ascending: true });
      return assertSupabaseOk(res, 'classes.select');
    },
  });

export const useStudentsForSecretariat = (search: string) =>
  useQuery({
    queryKey: ['students', 'secretariat', search],
    queryFn: async (): Promise<StudentListRow[]> => {
      const res = await supabase
        .from('students')
        .select('id,full_name,is_active, class:classes(id,name,year,section)')
        .order('created_at', { ascending: false });

      const rows = assertSupabaseOk(res, 'students.select(secretariat)');
      if (!search.trim()) return rows;
      const q = search.trim().toLowerCase();
      return rows.filter(r =>
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.class ? `${r.class.year}-${r.class.section}`.toLowerCase().includes(q) || r.class.name.toLowerCase().includes(q) : false)
      );
    },
  });

export type CreateStudentInput = {
  full_name: string;
  class_id: string;
  created_by: string;
  expires_in_days?: number;
  contact_email?: string | null;
  contact_phone?: string | null;
};

export const useCreateStudentWithActivation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStudentInput) => {
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .insert({ full_name: input.full_name, class_id: input.class_id, is_active: false, contact_email: input.contact_email ?? null, contact_phone: input.contact_phone ?? null })
        .select('id')
        .single();
      if (studentErr) throw studentErr;

      // Generate an 8-char activation code on the DB side (consistent with your SQL function)
      const gen = await supabase.rpc('generate_activation_code');
      const code = assertSupabaseOk(gen as { data: string; error: unknown | null }, 'generate_activation_code');

      const expiresAt = addDays(new Date(), input.expires_in_days ?? 14).toISOString();
      const { data: activation, error: actErr } = await supabase
        .from('student_activations')
        .insert({
          student_id: student.id,
          activation_code: String(code).toUpperCase(),
          expires_at: expiresAt,
          created_by: input.created_by,
        })
        .select('activation_code,expires_at')
        .single();
      if (actErr) throw actErr;

      return { student_id: student.id, activation_code: activation.activation_code, expires_at: activation.expires_at };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['students', 'secretariat'] });
    },
  });
};
