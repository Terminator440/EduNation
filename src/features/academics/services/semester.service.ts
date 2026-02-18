import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { handleServiceError } from "@/lib/error-handler";

export type CloseSemesterResult = {
  success: boolean;
  message: string;
  students_processed: number;
  final_grades_created: number;
};

/**
 * Close a semester by calculating and saving final grades for all students
 * Once closed, grades from that semester cannot be modified
 */
export async function closeSemesterGrading(
  academicYear: number,
  semester: 1 | 2
): Promise<CloseSemesterResult> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  const { data, error } = await supabase.rpc("close_semester_grading", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
    p_semester: semester,
  });

  if (error) {
    handleServiceError(error, "Închidere semestru");
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error("Nu s-au returnat date de la server");
  }

  const result = data[0] as CloseSemesterResult;
  return result;
}

/**
 * Get current academic year
 * Academic year is determined by current date:
 * - If month is Sep-Dec: academic year = current year
 * - If month is Jan-Jun: academic year = current year - 1
 */
export function getCurrentAcademicYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();

  if (month >= 9) {
    // September-December: academic year is current year
    return year;
  } else {
    // January-June: academic year is previous year
    return year - 1;
  }
}

/**
 * Get current semester based on current date
 */
export function getCurrentSemester(): 1 | 2 {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12

  // Semester 1: September (9) - January (1)
  if (month >= 9 || month === 1) {
    return 1;
  }
  // Semester 2: February (2) - June (6)
  return 2;
}
