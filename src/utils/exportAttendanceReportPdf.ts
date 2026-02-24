/**
 * Raport absențe PDF (jsPDF): pe clasă – elevi cu total absențe (și motivate).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type AttendanceReportStudent = {
  student_name: string | null;
  student_number: number | null;
  total_absences: number;
  motivated?: number;
};

export type AttendanceReportPayload = {
  class_name: string;
  school_name?: string;
  period?: string;
  students: AttendanceReportStudent[];
};

export function exportAttendanceReportPdf(payload: AttendanceReportPayload): void {
  if (!payload) throw new Error("Date invalide pentru raport");
  const students = Array.isArray(payload.students) ? payload.students : [];
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.getPageWidth();
  let y = 16;

  doc.setFontSize(16);
  doc.text("Raport absențe", pageW / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(11);
  doc.text(`Clasă: ${payload.class_name ?? "—"}`, 14, y);
  y += 6;
  if (payload.school_name) {
    doc.text(`Școală: ${payload.school_name}`, 14, y);
    y += 6;
  }
  if (payload.period) {
    doc.text(`Perioadă: ${payload.period}`, 14, y);
    y += 6;
  }
  y += 6;

  doc.setFontSize(12);
  doc.text("Elevi și număr absențe", 14, y);
  y += 8;

  const body =
    students.length > 0
      ? students.map((s) => [
          String(s.student_number ?? "—"),
          s.student_name ?? "—",
          String(s.total_absences ?? 0),
          String(s.motivated ?? "—"),
        ])
      : [["—", "Niciun elev", "—", "—"]];

  autoTable(doc, {
    startY: y,
    head: [["Nr.", "Nume elev", "Total absențe", "Motivate"]],
    body,
    margin: { left: 14 },
    theme: "grid",
  });

  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  y = (lastY ?? y) + 10;
  doc.setFontSize(9);
  doc.text(`Generat: ${new Date().toLocaleDateString("ro-RO")}`, 14, y);

  const safeName = payload.class_name.replace(/[^a-zA-Z0-9\u0103\u0102\u0218\u0219\u021A\u021B\- ]/g, "_");
  doc.save(`raport_absente_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
