import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import type { Database } from "@/integrations/supabase/types";

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

// Manual type definition for final_grades (not yet in generated types)
type FinalGradeRow = {
  id: string;
  student_id: string;
  subject_id: string;
  school_id: string;
  academic_year: number;
  semester: number;
  final_grade: number;
  calculated_average: number;
  grade_count: number;
  calculated_at: string;
  calculated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

interface ClassRegisterData {
  school: SchoolRow;
  class: ClassRow;
  students: StudentRow[];
  subjects: SubjectRow[];
  finalGrades: FinalGradeRow[];
  academicYear?: number;
  semester?: 1 | 2;
}

/**
 * Fetch all data needed for class register PDF
 */
export async function fetchClassRegisterData(
  classId: string,
  academicYear?: number,
  semester?: 1 | 2
): Promise<ClassRegisterData> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) {
    throw new Error("Nu aveți o școală asociată");
  }

  // Fetch school data
  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("*")
    .eq("id", schoolId)
    .maybeSingle();

  if (schoolError || !school) {
    throw new Error("Nu s-a putut încărca datele școlii");
  }

  // Fetch class data
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (classError || !classData) {
    throw new Error("Nu s-a putut încărca datele clasei");
  }

  // Fetch students
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("*")
    .eq("class_id", classId)
    .eq("school_id", schoolId)
    .order("student_number", { ascending: true });

  if (studentsError) {
    throw new Error("Nu s-au putut încărca elevii");
  }

  // Fetch subjects for this class
  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("*")
    .eq("class_id", classId)
    .eq("school_id", schoolId)
    .order("name", { ascending: true });

  if (subjectsError) {
    throw new Error("Nu s-au putut încărca materiile");
  }

  // Fetch final grades if academic year and semester are provided
  let finalGrades: FinalGradeRow[] = [];
  if (academicYear && semester) {
    const studentIds = (students || []).map((s) => s.id);
    const subjectIds = (subjects || []).map((s) => s.id);

    if (studentIds.length > 0 && subjectIds.length > 0) {
      const { data: grades, error: gradesError } = await supabase
        .from("final_grades")
        .select("*")
        .eq("school_id", schoolId)
        .eq("academic_year", academicYear)
        .eq("semester", semester)
        .in("student_id", studentIds)
        .in("subject_id", subjectIds);

      if (!gradesError && grades) {
        finalGrades = grades;
      }
    }
  }

  return {
    school,
    class: classData,
    students: students || [],
    subjects: subjects || [],
    finalGrades,
    academicYear,
    semester,
  };
}

/**
 * Generate PDF for Class Register (Foaia Matricolă)
 */
export async function exportClassRegisterPdf(
  classId: string,
  academicYear?: number,
  semester?: 1 | 2
): Promise<void> {
  try {
    // Fetch all data
    const data = await fetchClassRegisterData(classId, academicYear, semester);

    // Create PDF document
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;

    // Header: School name and logo area
    let yPos = margin;

    // School name (centered, bold, larger font)
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    const schoolName = data.school.name || "Școală";
    const schoolNameWidth = doc.getTextWidth(schoolName);
    doc.text(schoolName, (pageWidth - schoolNameWidth) / 2, yPos + 8);

    // Subtitle: "FOAIA MATRICOLĂ"
    yPos += 12;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    const title = "FOAIA MATRICOLĂ";
    const titleWidth = doc.getTextWidth(title);
    doc.text(title, (pageWidth - titleWidth) / 2, yPos);

    // Class info
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const classLabel = `Clasa: ${data.class.name || ""} ${data.class.year || ""}${data.class.section || ""}`;
    doc.text(classLabel, margin, yPos);

    // Academic year and semester if provided
    if (academicYear && semester) {
      const semesterLabel = `An școlar: ${academicYear}-${academicYear + 1}, Semestrul ${semester}`;
      doc.text(semesterLabel, pageWidth - margin - doc.getTextWidth(semesterLabel), yPos);
    }

    // Generation date
    yPos += 6;
    const generationDate = `Generat la: ${new Date().toLocaleDateString("ro-RO", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text(generationDate, pageWidth - margin - doc.getTextWidth(generationDate), yPos);

    // Prepare table data
    yPos += 10;

    // Table headers: Nr. crt., Nume elev, then each subject, then Media generală
    const headers: string[] = ["Nr.", "Nume elev"];
    data.subjects.forEach((subject) => {
      headers.push(subject.name || "Materie");
    });
    headers.push("Medie gen.");

    // Table rows
    const rows: (string | number)[][] = [];
    data.students.forEach((student, index) => {
      const row: (string | number)[] = [
        student.student_number || index + 1,
        student.full_name || "(fără nume)",
      ];

      // Add final grade for each subject
      data.subjects.forEach((subject) => {
        const finalGrade = data.finalGrades.find(
          (fg) => fg.student_id === student.id && fg.subject_id === subject.id
        );
        if (finalGrade) {
          row.push(finalGrade.final_grade);
        } else {
          row.push("—");
        }
      });

      // Calculate general average (average of all final grades for this student)
      const studentFinalGrades = data.finalGrades.filter((fg) => fg.student_id === student.id);
      if (studentFinalGrades.length > 0) {
        const avg =
          studentFinalGrades.reduce((sum, fg) => sum + fg.final_grade, 0) /
          studentFinalGrades.length;
        row.push(avg.toFixed(2));
      } else {
        row.push("—");
      }

      rows.push(row);
    });

    // Generate table using autoTable
    autoTable(doc, {
      startY: yPos,
      head: [headers],
      body: rows,
      theme: "grid",
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" }, // Nr.
        1: { cellWidth: 50 }, // Nume elev
      },
      margin: { left: margin, right: margin },
      styles: {
        overflow: "linebreak",
        cellPadding: 2,
      },
      didDrawPage: (_data) => {
        // Add page number
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const pageNum = doc.getCurrentPageInfo().pageNumber;
        const totalPages = doc.getCurrentPageInfo().totalPages;
        doc.text(
          `Pagina ${pageNum} din ${totalPages}`,
          pageWidth - margin - doc.getTextWidth(`Pagina ${pageNum} din ${totalPages}`),
          pageHeight - margin
        );
      },
    });

    // Footer: School address and contact info (if available)
    const docWithTable = doc as { lastAutoTable?: { finalY?: number } };
    const finalY = docWithTable.lastAutoTable?.finalY ?? yPos + 50;
    if (finalY < pageHeight - 20) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      let footerY = pageHeight - 15;

      if (data.school.address) {
        doc.text(`Adresă: ${data.school.address}`, margin, footerY);
        footerY -= 4;
      }
      if (data.school.phone) {
        doc.text(`Telefon: ${data.school.phone}`, margin, footerY);
        footerY -= 4;
      }
      if (data.school.email) {
        doc.text(`Email: ${data.school.email}`, margin, footerY);
      }
    }

    // Save PDF
    const fileName = `foaia_matricola_${data.class.name || "clasa"}_${data.class.year || ""}${data.class.section || ""}_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}
