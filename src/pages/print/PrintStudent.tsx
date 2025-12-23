/**
 * Print-ready student report page.
 * Deterministic rendering for printing (use with window.print()).
 */
type Student = {
  id?: string;
  name: string;
  class: string;
};

type PrintStudentProps = {
  student: Student;
  grades: unknown;
  absences: unknown;
};

export default function PrintStudent({ student, grades, absences }: PrintStudentProps) {
  return (
    <div>
      <h1>Situație elev</h1>
      <p>Nume: {student.name}</p>
      <p>Clasa: {student.class}</p>

      <h2>Note</h2>
      <pre>{JSON.stringify(grades, null, 2)}</pre>

      <h2>Absențe</h2>
      <pre>{JSON.stringify(absences, null, 2)}</pre>
    </div>
  );
}
