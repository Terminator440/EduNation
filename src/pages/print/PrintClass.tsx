
/**
 * Print-ready class report
 */
export default function PrintClass({ className, students }) {
  return (
    <div>
      <h1>Situație clasă {className}</h1>
      <pre>{JSON.stringify(students, null, 2)}</pre>
    </div>
  );
}
