/**
 * Report API (pseudo-API layer). Export class/student reports; all report data + PDF via this layer.
 */
import { fetchStudentReport, fetchClassReport } from "@/features/reports/services/reports.service";
import { exportStudentReportPdf } from "@/utils/exportStudentReportPdf";
import { exportClassReportPdf } from "@/utils/exportClassReportPdf";

/**
 * Fetch class report data and export to PDF (download).
 */
export async function exportClassReport(classId: string): Promise<void> {
  const payload = await fetchClassReport(classId);
  exportClassReportPdf(payload);
}

/**
 * Fetch student report data and export to PDF (download).
 */
export async function exportStudentReport(studentId: string): Promise<void> {
  const payload = await fetchStudentReport(studentId);
  exportStudentReportPdf(payload);
}

export { fetchClassReport, fetchStudentReport } from "@/features/reports/services/reports.service";
export type { ClassReportPayload, StudentReportPayload } from "@/features/reports/services/reports.service";
