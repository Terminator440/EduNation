import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Award, BookOpen } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useGradesForScope, useStudentScope } from "@/features/academics/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const getAverageColor = (avg: number) => {
  if (avg >= 9) return "text-success";
  if (avg >= 7) return "text-primary";
  if (avg >= 5) return "text-warning";
  return "text-destructive";
};

const getGradeColor = (grade: number) => {
  if (grade >= 9) return "bg-success/10 text-success";
  if (grade >= 7) return "bg-primary/10 text-primary";
  if (grade >= 5) return "bg-warning/10 text-warning";
  return "bg-destructive/10 text-destructive";
};

const Grades = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const { user, activeRole } = useAuth();
  const scopeQuery = useStudentScope(activeRole, user?.id ?? null);
  const gradesQuery = useGradesForScope(scopeQuery.data?.studentIds ?? []);

  const gradesBySubject = useMemo(() => {
    const rows = gradesQuery.data ?? [];
    const map = new Map<string, { subject: string; grades: number[]; average: number }>();
    for (const r of rows) {
      const subjectName = r.subject?.name ?? 'Materie necunoscută';
      const existing = map.get(subjectName) ?? { subject: subjectName, grades: [], average: 0 };
      existing.grades.push(r.grade);
      map.set(subjectName, existing);
    }
    const out = Array.from(map.values()).map(s => ({
      ...s,
      average: s.grades.length ? s.grades.reduce((a, b) => a + b, 0) / s.grades.length : 0,
    }));
    // keep a stable order
    return out.sort((a, b) => a.subject.localeCompare(b.subject, 'ro'));
  }, [gradesQuery.data]);

  const generalAverage = useMemo(() => {
    if (gradesBySubject.length === 0) return 0;
    const sum = gradesBySubject.reduce((sum, g) => sum + g.average, 0);
    return sum / gradesBySubject.length;
  }, [gradesBySubject]);

  const bestSubject = useMemo(() => {
    return gradesBySubject.reduce(
      (best, g) => (g.average > best.average ? g : best),
      gradesBySubject[0] ?? { subject: '-', grades: [], average: 0 }
    );
  }, [gradesBySubject]);

  const totalGrades = useMemo(() => gradesBySubject.reduce((sum, g) => sum + g.grades.length, 0), [gradesBySubject]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Notele mele</h1>
            <p className="text-sm text-muted-foreground">Situația școlară completă</p>
          </div>
        </header>

        <div className="p-8">
          {(activeRole !== 'student' && activeRole !== 'parent') && (
            <Alert className="mb-8">
              <AlertTitle>Acces limitat</AlertTitle>
              <AlertDescription>
                Pagina „Note” este disponibilă doar pentru rolurile Elev și Părinte.
              </AlertDescription>
            </Alert>
          )}

          {(scopeQuery.isLoading || gradesQuery.isLoading) && (
            <div className="space-y-4 mb-8">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          )}

          {(scopeQuery.isError || gradesQuery.isError) && (
            <Alert variant="destructive" className="mb-8">
              <AlertTitle>Eroare</AlertTitle>
              <AlertDescription>
                Nu am putut încărca notele. Verifică dacă ești autentificat și dacă ai acces (RLS) în Supabase.
              </AlertDescription>
            </Alert>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Media Generală</p>
                  <p className={cn("text-3xl font-bold mt-1", getAverageColor(generalAverage))}>
                    {generalAverage.toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Note</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{totalGrades}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-accent" />
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cea mai bună materie</p>
                  <p className="text-xl font-bold text-foreground mt-1">{bestSubject.subject}</p>
                  <p className="text-sm text-success">{bestSubject.average.toFixed(2)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                  <Award className="w-6 h-6 text-success" />
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Materii</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{gradesBySubject.length}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-warning" />
                </div>
              </div>
            </div>
          </div>

          {/* Grades Table */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Toate notele pe materii</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-muted-foreground">Materie</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-muted-foreground">Note</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-muted-foreground">Media</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-muted-foreground">Profesor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gradesBySubject.map((grade, index) => (
                    <tr 
                      key={index} 
                      className={cn(
                        "hover:bg-secondary/30 transition-colors cursor-pointer",
                        selectedSubject === grade.subject && "bg-primary/5"
                      )}
                      onClick={() => setSelectedSubject(selectedSubject === grade.subject ? null : grade.subject)}
                    >
                      <td className="px-6 py-4">
                        <span className="font-medium text-foreground">{grade.subject}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {grade.grades.map((g, i) => (
                            <span
                              key={i}
                              className={cn(
                                "inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-semibold",
                                getGradeColor(g)
                              )}
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("text-xl font-bold", getAverageColor(grade.average))}>
                          {grade.average.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {/* Teacher name depends on joining with profiles; keep it safe here */}
                        —
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {gradesBySubject.length === 0 && !gradesQuery.isLoading && !gradesQuery.isError && (
            <div className="mt-6 text-sm text-muted-foreground">
              Nu există note încă (sau nu ai încă un elev asociat în baza de date).
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Grades;
