import { cn } from "@/lib/utils";

interface Grade {
  subject: string;
  grades: number[];
  average: number;
  teacher: string;
}

interface GradesTableProps {
  grades: Grade[];
}

const GradesTable = ({ grades }: GradesTableProps) => {
  const getAverageColor = (avg: number) => {
    if (avg >= 9) return "text-success";
    if (avg >= 7) return "text-primary";
    if (avg >= 5) return "text-warning";
    return "text-destructive";
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">Notele mele</h3>
        <p className="text-sm text-muted-foreground mt-1">Situația școlară curentă</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary/50">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-semibold text-muted-foreground">Materie</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-muted-foreground">Note</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-muted-foreground">Media</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-muted-foreground">Profesor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {grades.map((grade, index) => (
              <tr key={index} className="hover:bg-secondary/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="font-medium text-foreground">{grade.subject}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2 flex-wrap">
                    {grade.grades.map((g, i) => (
                      <span
                        key={i}
                        className={cn(
                          "inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-semibold",
                          g >= 9 ? "bg-success/10 text-success" :
                          g >= 7 ? "bg-primary/10 text-primary" :
                          g >= 5 ? "bg-warning/10 text-warning" :
                          "bg-destructive/10 text-destructive"
                        )}
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "text-lg font-bold",
                    getAverageColor(grade.average)
                  )}>
                    {grade.average.toFixed(2)}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-foreground">
                  {grade.teacher}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GradesTable;
