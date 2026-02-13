import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Award, BookOpen } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSubjectAveragesForScope, useGeneralAveragesForScope, useGradesForScope, useStudentScope, useStudentsForScope } from "@/features/academics/queries";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const { user, activeRole } = useAuth();
  const scopeQuery = useStudentScope(activeRole, user?.id ?? null);
  const studentIds = scopeQuery.data?.studentIds ?? [];
  const studentsQuery = useStudentsForScope(studentIds);
  const subjectAveragesQuery = useSubjectAveragesForScope(studentIds);
  const generalAveragesQuery = useGeneralAveragesForScope(studentIds);
  const gradesQuery = useGradesForScope(studentIds);

  const studentNames = useMemo(() => {
    const rows = studentsQuery.data ?? [];
    return new Map(rows.map(s => [s.id, s.full_name ?? 'Elev']));
  }, [studentsQuery.data]);

  const hasMultipleStudents = studentIds.length > 1;

  // One row per (student_id, subject) - corect pentru părinți cu mai mulți copii
  const gradesBySubject = useMemo(() => {
    const rows = subjectAveragesQuery.data ?? [];
    return rows.map(r => ({
      student_id: r.student_id,
      subject: r.subject_name ?? 'Materie necunoscută',
      average: Number(r.average),
      grade_count: r.grade_count ?? 0,
      rowKey: `${r.student_id}|${r.subject_name ?? ''}`,
    })).sort((a, b) => {
      const cmp = a.subject.localeCompare(b.subject, 'ro');
      return cmp !== 0 ? cmp : (studentNames.get(a.student_id) ?? '').localeCompare(studentNames.get(b.student_id) ?? '', 'ro');
    });
  }, [subjectAveragesQuery.data, studentNames]);

  const gradesBySubjectName = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of gradesQuery.data ?? []) {
      const name = r.subject?.name ?? 'Materie necunoscută';
      const key = `${r.student_id}|${name}`;
      const arr = map.get(key) ?? [];
      arr.push(r.grade);
      map.set(key, arr);
    }
    return map;
  }, [gradesQuery.data]);

  const generalAverage = useMemo(() => {
    const map = generalAveragesQuery.data ?? {};
    const vals = Object.values(map).filter((v): v is number => typeof v === 'number' && v > 0);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [generalAveragesQuery.data]);

  const bestSubject = useMemo(() => {
    return gradesBySubject.reduce(
      (best, g) => (g.average > best.average ? g : best),
      gradesBySubject[0] ?? { subject: '-', average: 0, grade_count: 0, student_id: '', rowKey: '' }
    );
  }, [gradesBySubject]);

  const totalGrades = useMemo(() => gradesBySubject.reduce((sum, g) => sum + g.grade_count, 0), [gradesBySubject]);

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
          {(scopeQuery.isLoading || studentsQuery.isLoading || subjectAveragesQuery.isLoading || generalAveragesQuery.isLoading || gradesQuery.isLoading) && (
            <div className="space-y-4 mb-8">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          )}

          {(scopeQuery.isError || studentsQuery.isError || subjectAveragesQuery.isError || generalAveragesQuery.isError || gradesQuery.isError) && (
            <div className="mb-8 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              Nu am putut încărca notele. Verifică dacă ești autentificat.
            </div>
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
                  <p className="text-sm text-muted-foreground">Materii (per elev)</p>
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
                    {hasMultipleStudents && (
                      <th className="text-left px-6 py-4 text-sm font-semibold text-muted-foreground">Elev</th>
                    )}
                    <th className="text-left px-6 py-4 text-sm font-semibold text-muted-foreground">Note</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-muted-foreground">Media</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-muted-foreground">Profesor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gradesBySubject.map((grade) => (
                    <tr 
                      key={grade.rowKey} 
                      className={cn(
                        "hover:bg-secondary/30 transition-colors cursor-pointer",
                        selectedRowKey === grade.rowKey && "bg-primary/5"
                      )}
                      onClick={() => setSelectedRowKey(selectedRowKey === grade.rowKey ? null : grade.rowKey)}
                    >
                      <td className="px-6 py-4">
                        <span className="font-medium text-foreground">{grade.subject}</span>
                      </td>
                      {hasMultipleStudents && (
                        <td className="px-6 py-4 text-muted-foreground">
                          {studentNames.get(grade.student_id) ?? 'Elev'}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {(gradesBySubjectName.get(grade.rowKey) ?? []).map((g, i) => (
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

          {gradesBySubject.length === 0 && !subjectAveragesQuery.isLoading && !subjectAveragesQuery.isError && (
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
