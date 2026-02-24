/**
 * Export student report (grades + attendance + averages) to PDF using get_student_report RPC data.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StudentReportPayload } from "@/features/reports/services/reports.service";

export function exportStudentReportPdf(payload: StudentReportPayload): void {
  if (!payload || !payload.success || !payload.student_id) {
    throw new Error(payload?.error ?? "Date invalide pentru raport");
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.getPageWidth();
  let y = 16;

  doc.setFontSize(16);
  doc.text("Raport elev", pageW / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(11);
  doc.text(`Elev: ${payload.student_name ?? "—"}`, 14, y);
  y += 6;
  doc.text(`Clasă: ${payload.class_name ?? "—"}`, 14, y);
  y += 10;

  const grades = Array.isArray(payload.grades) ? payload.grades : [];
  const attendance = Array.isArray(payload.attendance) ? payload.attendance : [];
  const averages = Array.isArray(payload.subject_averages) ? payload.subject_averages : [];

  if (averages.length > 0) {
    doc.setFontSize(12);
    doc.text("Medii pe materii", 14, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Materie", "Medie", "Nr. note"]],
      body: averages.map((a) => [
        a.subject_name ?? "—",
        String(a.average ?? "—"),
        String(a.grade_count ?? 0),
      ]),
      margin: { left: 14 },
      theme: "grid",
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 10;
  }

  if (grades.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(12);
    doc.text("Note", 14, y);
    y += 8;
    const gradeRows = grades.slice(0, 50).map((g) => [g.date, g.subject_name ?? "—", String(g.grade), g.description ?? "—"]);
    autoTable(doc, {
      startY: y,
      head: [["Data", "Materie", "Notă", "Observații"]],
      body: gradeRows,
      margin: { left: 14 },
      theme: "grid",
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 10;
    if (grades.length > 50) {
      doc.setFontSize(9);
      doc.text(`(afișate primele 50 din ${grades.length} note)`, 14, y);
      y += 8;
    }
  }

  if (attendance.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(12);
    doc.text("Prezență / Absențe", 14, y);
    y += 8;
    const attRows = attendance.slice(0, 40).map((a) => [
      a.date,
      a.subject_name ?? "—",
      a.status,
      a.is_excused ? "Da" : "Nu",
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Data", "Materie", "Status", "Motivată"]],
      body: attRows,
      margin: { left: 14 },
      theme: "grid",
    });
    if (attendance.length > 40) {
      const tblY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
      const finalY = tblY + 6;
      doc.setFontSize(9);
      doc.text(`(afișate primele 40 din ${attendance.length} înregistrări)`, 14, finalY);
    }
  }

  const safeName = (payload.student_name ?? "elev").replace(/[^a-zA-Z0-9\u0103\u0102\u0218\u0219\u021A\u021B\- ]/g, "_");
  doc.save(`raport_elev_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
