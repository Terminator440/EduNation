/**
 * Search global: elevi după nume, clase după nume. Scoped la școala utilizatorului.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";

export type GlobalSearchStudent = {
  id: string;
  full_name: string | null;
  student_number: number | null;
  class_name: string | null;
};

export type GlobalSearchClass = {
  id: string;
  name: string;
  year: number | null;
  section: string | null;
};

export type GlobalSearchResult = {
  students: GlobalSearchStudent[];
  classes: GlobalSearchClass[];
};

export async function globalSearch(query: string, schoolId?: string | null): Promise<GlobalSearchResult> {
  const q = query.trim();
  const sid = schoolId ?? await getCurrentUserSchoolId();
  if (!q || !sid) return { students: [], classes: [] };

  const term = `%${q}%`;

  const [studentsRes, classesRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, student_number, classes(name)")
      .eq("school_id", sid)
      .or("is_active.is.null,is_active.eq.true")
      .ilike("full_name", term)
      .limit(15),
    supabase
      .from("classes")
      .select("id, name, year, section")
      .eq("school_id", sid)
      .or(`name.ilike.${term},section.ilike.${term}`)
      .limit(10),
  ]);

  const students: GlobalSearchStudent[] = (studentsRes.data ?? []).map((r: { id: string; full_name: string | null; student_number: number | null; classes: { name: string } | null }) => ({
    id: r.id,
    full_name: r.full_name,
    student_number: r.student_number,
    class_name: r.classes?.name ?? null,
  }));

  const classes: GlobalSearchClass[] = (classesRes.data ?? []).map((r: { id: string; name: string; year: number | null; section: string | null }) => ({
    id: r.id,
    name: r.name,
    year: r.year,
    section: r.section,
  }));

  return { students, classes };
}
