/**
 * Export class report (per-student summary) to PDF using get_class_report RPC data.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ClassReportPayload } from "@/features/reports/services/reports.service";

export function exportClassReportPdf(payload: ClassReportPayload): void {
  if (!payload.success || !payload.class_id) {
    throw new Error(payload.error ?? "Date invalide pentru raport");
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.getPageWidth();
  let y = 16;

  doc.setFontSize(16);
  doc.text("Raport clasă", pageW / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(11);
  doc.text(`Clasă: ${payload.class_name ?? "—"}`, 14, y);
  y += 10;

  const students = payload.students ?? [];
  const body = students.map((s) => [
    String(s.student_number ?? "—"),
    s.student_name ?? "—",
    s.general_average != null ? s.general_average.toFixed(2) : "—",
    String(s.total_absences ?? 0),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Nr.", "Nume elev", "Medie generală", "Absențe"]],
    body,
    margin: { left: 14 },
    theme: "grid",
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (students.some((s) => (s.subject_averages ?? []).length > 0)) {
    if (y > 250) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(12);
    doc.text("Medii pe materii (per elev)", 14, y);
    y += 8;
    for (const s of students.slice(0, 20)) {
      const avgs = s.subject_averages ?? [];
      if (avgs.length === 0) continue;
      doc.setFontSize(10);
      doc.text(`${s.student_number ?? "—"} ${s.student_name ?? "—"}`, 14, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [["Materie", "Medie"]],
        body: avgs.map((a) => [a.subject_name ?? "—", String(a.average)]),
        margin: { left: 20 },
        theme: "grid",
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      if (y > 260) {
        doc.addPage();
        y = 16;
      }
    }
    if (students.length > 20) {
      doc.setFontSize(9);
      doc.text(`(medii detaliate pentru primele 20 elevi din ${students.length})`, 14, y);
    }
  }

  const safeName = (payload.class_name ?? "clasa").replace(/[^a-zA-Z0-9\u0103\u0102\u0218\u0219\u021A\u021B\- ]/g, "_");
  doc.save(`raport_clasa_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
