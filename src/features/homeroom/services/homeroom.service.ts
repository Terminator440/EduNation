/**
 * Homeroom: add student, create class, fetch absences, motivate absences.
 * All DB access here; no direct supabase in UI.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { logError } from "@/lib/logger";
import { handleServiceError } from "@/lib/error-handler";
import { AppError } from "@/lib/errors";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

export type StudentInsertPayload = {
  class_id: string;
  school_id: string;
  full_name: string;
  student_number: number;
  is_active: boolean;
  cnp?: string | null;
  birth_date?: string | null;
  gender?: string | null;
};

export async function fetchStudentNumbersForClass(classId: string): Promise<(number | null)[]> {
  const { data } = await supabase
    .from("students")
    .select("student_number")
    .eq("class_id", classId);
  return (data ?? []).map((r: { student_number: number | null }) => r.student_number);
}

export async function checkStudentNumberInUse(classId: string, studentNumber: number): Promise<boolean> {
  const { data } = await supabase
    .from("students")
    .select("id")
    .eq("class_id", classId)
    .eq("student_number", studentNumber)
    .maybeSingle();
  return data != null;
}

export async function addStudent(payload: StudentInsertPayload): Promise<void> {
  const { error } = await supabase.from("students").insert(payload);
  if (error) {
    logError("Student insert", error, { context: "addStudent" });
    handleServiceError(error, "Adăugare elev");
    throw new AppError(toFriendlySupabaseError(error), { context: "addStudent", cause: error });
  }
}

export type ClassInsertPayload = {
  year: number;
  section: string;
  name: string;
  teacher_id: string;
  school_id: string;
};

export async function createClass(payload: ClassInsertPayload): Promise<void> {
  const { error } = await supabase.from("classes").insert(payload);
  if (error) {
    logError("Class insert", error, { context: "createClass" });
    handleServiceError(error, "Creare clasă");
    throw new AppError(toFriendlySupabaseError(error), { context: "createClass", cause: error });
  }
}

export type AbsenceRow = {
  id: string;
  date: string;
  status: string;
  student_id: string;
  student_name: string;
  subject_name: string;
};

export async function fetchAbsencesForClass(classId: string, schoolId: string): Promise<AbsenceRow[]> {
  const { data: studentIds } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("class_id", classId)
    .eq("school_id", schoolId);
  if (!studentIds || studentIds.length === 0) return [];
  const ids = studentIds.map((s) => s.id);
  const studentMap = Object.fromEntries(
    studentIds.map((s) => [s.id, s.full_name || "Necunoscut"])
  );
  const { data: absenceData } = await supabase
    .from("attendance")
    .select("id, date, status, student_id, subject_id")
    .in("student_id", ids)
    .in("status", ["unexcused", "pending"])
    .is("deleted_at", null)
    .order("date", { ascending: false });
  if (!absenceData || absenceData.length === 0) return [];
  const subjectIds = [...new Set(absenceData.map((a: { subject_id: string }) => a.subject_id))];
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .in("id", subjectIds);
  const subjectMap = Object.fromEntries((subjects || []).map((s: { id: string; name: string }) => [s.id, s.name]));
  return absenceData.map((a: { id: string; date: string; status: string; student_id: string; subject_id: string }) => ({
    id: a.id,
    date: a.date,
    status: a.status,
    student_id: a.student_id,
    student_name: studentMap[a.student_id],
    subject_name: subjectMap[a.subject_id] || "Necunoscut",
  }));
}

export type HomeroomClassInfo = {
  id: string;
  name: string;
  section: string;
  year: number;
  school_id: string | null;
};

export type HomeroomStudent = {
  id: string;
  student_number: number | string | null;
  full_name: string | null;
  is_active: boolean;
  user_id: string | null;
  activation_code: string | null;
  profile: { email: string } | null;
};

export type HomeroomClassStats = {
  totalGrades: number;
  totalAbsences: number;
  averageGrade: number;
  motivatedAbsences: number;
};

export type HomeroomDashboardData = {
  classInfo: HomeroomClassInfo;
  students: HomeroomStudent[];
  classStats: HomeroomClassStats;
  alerts: { manyAbsences: HomeroomStudent[]; noGrades: HomeroomStudent[] };
};

export async function fetchHomeroomDashboardData(
  schoolId: string,
  teacherId: string
): Promise<HomeroomDashboardData | null> {
  const { data: classData } = await supabase
    .from("classes")
    .select("id, name, section, year, school_id")
    .eq("teacher_id", teacherId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!classData) return null;

  const classInfo: HomeroomClassInfo = {
    id: classData.id,
    name: classData.name,
    section: classData.section,
    year: classData.year,
    school_id: classData.school_id,
  };

  const { data: studentsData } = await supabase
    .from("students")
    .select("id, student_number, full_name, is_active, user_id")
    .eq("class_id", classData.id)
    .eq("school_id", schoolId)
    .order("student_number", { ascending: true });

  if (!studentsData || studentsData.length === 0) {
    return {
      classInfo,
      students: [],
      classStats: { totalGrades: 0, totalAbsences: 0, averageGrade: 0, motivatedAbsences: 0 },
      alerts: { manyAbsences: [], noGrades: [] },
    };
  }

  const studentIds = studentsData.map((s) => s.id);
  const userIds = studentsData
    .map((s) => s.user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const [activationsRes, profilesRes, gradesRes, attendanceRes] = await Promise.all([
    supabase
      .from("student_activations")
      .select("student_id, activation_code")
      .in("student_id", studentIds)
      .eq("is_used", false),
    userIds.length > 0
      ? supabase.from("profiles").select("id, email").in("id", userIds).eq("school_id", schoolId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("grades")
      .select("grade, student_id")
      .in("student_id", studentIds)
      .eq("school_id", schoolId)
      .is("deleted_at", null),
    supabase
      .from("attendance")
      .select("status, student_id")
      .in("student_id", studentIds)
      .eq("school_id", schoolId)
      .is("deleted_at", null),
  ]);

  const activationByStudent = new Map<string, string>();
  (activationsRes.data ?? []).forEach((r: { student_id: string; activation_code: string }) => {
    if (!activationByStudent.has(r.student_id)) {
      activationByStudent.set(r.student_id, r.activation_code);
    }
  });

  const profileByUser = new Map<string, { email: string }>();
  (profilesRes.data ?? []).forEach((p: { id: string; email: string }) => {
    profileByUser.set(p.id, { email: p.email });
  });

  const enrichedStudents: HomeroomStudent[] = studentsData.map((s) => ({
    ...s,
    activation_code: activationByStudent.get(s.id) ?? null,
    profile: s.user_id ? profileByUser.get(s.user_id) ?? null : null,
  }));

  const grades = gradesRes.data ?? [];
  const attendance = attendanceRes.data ?? [];

  const totalGrades = grades.length;
  const avgGrade =
    grades.length > 0
      ? grades.reduce((sum, g: { grade: number }) => sum + Number(g.grade), 0) / grades.length
      : 0;
  const absencesCount = attendance.filter((a: { status: string }) =>
    ["unexcused", "pending"].includes(a.status)
  ).length;
  const motivated = attendance.filter((a: { status: string }) => a.status === "motivated").length;

  const absByStudent = new Map<string, number>();
  attendance.forEach((a: { status: string; student_id: string }) => {
    if (!["unexcused", "pending"].includes(a.status)) return;
    absByStudent.set(a.student_id, (absByStudent.get(a.student_id) || 0) + 1);
  });

  const gradesByStudent = new Map<string, number>();
  grades.forEach((g: { student_id: string }) => {
    gradesByStudent.set(g.student_id, (gradesByStudent.get(g.student_id) || 0) + 1);
  });

  const parseStudentNumberNumeric = (n: number | string | null): number =>
    typeof n === "number" ? n : typeof n === "string" ? parseInt(n, 10) || 9999 : 9999;

  const threshold = 10;
  const manyAbsences = [...enrichedStudents]
    .filter((s) => (absByStudent.get(s.id) || 0) >= threshold)
    .sort((a, b) => (absByStudent.get(b.id) || 0) - (absByStudent.get(a.id) || 0));
  const noGrades = [...enrichedStudents]
    .filter((s) => (gradesByStudent.get(s.id) || 0) === 0)
    .sort(
      (a, b) =>
        parseStudentNumberNumeric(a.student_number) - parseStudentNumberNumeric(b.student_number)
    );

  return {
    classInfo,
    students: enrichedStudents,
    classStats: {
      totalGrades,
      averageGrade: avgGrade,
      totalAbsences: absencesCount,
      motivatedAbsences: motivated,
    },
    alerts: { manyAbsences, noGrades },
  };
}

export async function generateStudentActivationCode(
  studentId: string,
  createdByUserId: string
): Promise<string> {
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  const { error } = await supabase.from("student_activations").insert({
    student_id: studentId,
    activation_code: code,
    created_by: createdByUserId,
    expires_at: expiresAt.toISOString(),
  });
  if (error) {
    logError("Generate activation code", error, { context: "generateStudentActivationCode" });
    handleServiceError(error, "Generare cod activare");
    throw new AppError(toFriendlySupabaseError(error), { context: "generateStudentActivationCode", cause: error });
  }
  return code;
}

export async function motivateAbsences(
  attendanceIds: string[],
  excuseReason: string | null
): Promise<void> {
  const payload = {
    status: "motivated",
    motivated_at: new Date().toISOString(),
    ...(excuseReason ? { justification_doc: excuseReason } : {}),
  } as Record<string, unknown>;
  const { error } = await supabase.from("attendance").update(payload).in("id", attendanceIds);
  if (error) {
    const { error: fallback } = await supabase
      .from("attendance")
      .update({ status: "motivated" } as Record<string, unknown>)
      .in("id", attendanceIds);
    if (fallback) {
      logError("Motivate absences", fallback, { context: "motivateAbsences" });
      handleServiceError(fallback, "Motivare absențe");
      throw new AppError(toFriendlySupabaseError(fallback), { context: "motivateAbsences", cause: fallback });
    }
  }
}
