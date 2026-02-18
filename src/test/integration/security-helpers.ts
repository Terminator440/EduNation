import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** In-memory auth storage so tests don't share session with app or each other. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

export function createTestSupabaseClient() {
  if (!url || !anonKey) {
    throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required for integration tests.");
  }
  return createClient<Database>(url, anonKey, {
    auth: {
      storage: memoryStorage(),
      persistSession: true,
      autoRefreshToken: false,
    },
  });
}

export function isIntegrationTestEnvConfigured(): boolean {
  return Boolean(url && anonKey);
}

/** Vite exposes only VITE_* vars; set e.g. VITE_TEST_STUDENT_EMAIL in .env.test */
export function getTestUserEnv(): {
  studentEmail?: string;
  studentPassword?: string;
  teacherEmail?: string;
  teacherPassword?: string;
  teacherSchoolBEmail?: string;
  teacherSchoolBPassword?: string;
  parentEmail?: string;
  parentPassword?: string;
  directorEmail?: string;
  directorPassword?: string;
} {
  return {
    studentEmail: import.meta.env.VITE_TEST_STUDENT_EMAIL as string | undefined,
    studentPassword: import.meta.env.VITE_TEST_STUDENT_PASSWORD as string | undefined,
    teacherEmail: import.meta.env.VITE_TEST_TEACHER_EMAIL as string | undefined,
    teacherPassword: import.meta.env.VITE_TEST_TEACHER_PASSWORD as string | undefined,
    teacherSchoolBEmail: import.meta.env.VITE_TEST_TEACHER_SCHOOL_B_EMAIL as string | undefined,
    teacherSchoolBPassword: import.meta.env.VITE_TEST_TEACHER_SCHOOL_B_PASSWORD as string | undefined,
    parentEmail: import.meta.env.VITE_TEST_PARENT_EMAIL as string | undefined,
    parentPassword: import.meta.env.VITE_TEST_PARENT_PASSWORD as string | undefined,
    directorEmail: import.meta.env.VITE_TEST_DIRECTOR_EMAIL as string | undefined,
    directorPassword: import.meta.env.VITE_TEST_DIRECTOR_PASSWORD as string | undefined,
  };
}

export function hasStudentCredentials(): boolean {
  const { studentEmail, studentPassword } = getTestUserEnv();
  return Boolean(studentEmail && studentPassword);
}

export function hasTeacherCredentials(): boolean {
  const { teacherEmail, teacherPassword } = getTestUserEnv();
  return Boolean(teacherEmail && teacherPassword);
}

export function hasParentCredentials(): boolean {
  const { parentEmail, parentPassword } = getTestUserEnv();
  return Boolean(parentEmail && parentPassword);
}

/** Profesor de la o altă școală (ex. Liceul Cucu / Școala B) pentru testul Cross-School Access. */
export function hasTeacherSchoolBCredentials(): boolean {
  const { teacherSchoolBEmail, teacherSchoolBPassword } = getTestUserEnv();
  return Boolean(teacherSchoolBEmail && teacherSchoolBPassword);
}

/** Director/secretariat pentru setup/cleanup la testul Semestru Închis (blocare semestru). */
export function hasDirectorCredentials(): boolean {
  const { directorEmail, directorPassword } = getTestUserEnv();
  return Boolean(directorEmail && directorPassword);
}
