/**
 * Print-ready class report page.
 * Deterministic rendering for printing (use with window.print()).
 */
type PrintClassProps = {
  className: string;
  students: unknown;
};

export default function PrintClass({ className, students }: PrintClassProps) {
  return (
    <div>
      <h1>Situație clasă {className}</h1>
      <pre>{JSON.stringify(students, null, 2)}</pre>
    </div>
  );
}
