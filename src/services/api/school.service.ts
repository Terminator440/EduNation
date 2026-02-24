/**
 * School API (pseudo-API layer). All school/year operations go through this.
 * Delegates to feature services; no direct Supabase in callers.
 */
import {
  fetchSchoolYears,
  createSchoolYear,
  activateSchoolYear,
  archiveSchoolYear,
  promoteStudents,
  archiveCurrentYearAndCreateNext,
  type SchoolYearRow,
} from "@/features/school-years/schoolYears.service";

export type { SchoolYearRow };

export const getSchoolYears = fetchSchoolYears;
export const createSchoolYearApi = createSchoolYear;
export const activateSchoolYearApi = activateSchoolYear;
export const archiveSchoolYearApi = archiveSchoolYear;
export const promoteStudentsApi = promoteStudents;
export const archiveCurrentYearAndCreateNextApi = archiveCurrentYearAndCreateNext;
