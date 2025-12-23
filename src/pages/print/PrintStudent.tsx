
/**
 * Print-ready student report
 */
export default function PrintStudent({ student, grades, absences }) {
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
