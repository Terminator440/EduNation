import { useMemo } from "react";
import { TrendingUp, TrendingDown, Award, BookOpen } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSubjectAveragesForScope, useGeneralAveragesForScope, useGradesForScope, useStudentScope, useStudentsForScope } from "@/features/academics/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

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

type GradeSubjectRow = {
  student_id: string;
  subject: string;
  average: number;
  grade_count: number;
  rowKey: string;
};

const Grades = () => {
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

  const gradesBySubject = useMemo<GradeSubjectRow[]>(() => {
    const rows = subjectAveragesQuery.data ?? [];
    return rows.map(r => ({
      student_id: r.student_id,
      subject: r.subject_name ?? 'Materie necunoscută',
      average: Number(r.average),
      grade_count: r.grade_count ?? 0,
      rowKey: `${r.student_id}|${r.subject_name ?? ''}`,
    })).sort((a, b) => a.subject.localeCompare(b.subject, 'ro'));
  }, [subjectAveragesQuery.data]);

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

  // Adaugă acest mic helper pentru a calcula media anterioară (exemplu ipotetic)
  // Într-o fază avansată, datele astea ar veni din DB
  const trend = generalAverage >= 8.5 ? "up" : "down";

  const bestSubject = useMemo(() => {
    return gradesBySubject.reduce(
      (best, g) => (g.average > best.average ? g : best),
      gradesBySubject[0] ?? { subject: '-', average: 0, grade_count: 0, student_id: '', rowKey: '' }
    );
  }, [gradesBySubject]);

  const totalGrades = useMemo(() => gradesBySubject.reduce((sum, g) => sum + g.grade_count, 0), [gradesBySubject]);

  const isLoading = scopeQuery.isLoading || studentsQuery.isLoading || subjectAveragesQuery.isLoading || generalAveragesQuery.isLoading || gradesQuery.isLoading;
  const isError = scopeQuery.isError || studentsQuery.isError || subjectAveragesQuery.isError || generalAveragesQuery.isError || gradesQuery.isError;

  const columns: DataTableColumn<GradeSubjectRow>[] = [
    { key: "subject", header: "Materie", accessor: (r) => r.subject },
    ...(hasMultipleStudents ? [{
      key: "student",
      header: "Elev",
      accessor: (r: GradeSubjectRow) => studentNames.get(r.student_id) ?? "Elev",
    }] : []),
    {
      key: "grades",
      header: "Note",
      sortable: false,
      render: (row) => (
        <div className="flex gap-2 flex-wrap">
          {(gradesBySubjectName.get(row.rowKey) ?? []).map((g, i) => (
            <span key={i} className={cn("inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-semibold", getGradeColor(g))}>
              {g}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "average",
      header: "Media",
      accessor: (r) => r.average,
      render: (row) => (
        <span className={cn("text-xl font-bold", getAverageColor(row.average))}>
          {row.average.toFixed(2)}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout title="Notele mele" subtitle="Situația școlară completă">
      {isLoading && (
        <div className="space-y-4 mb-8">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      )}

      {isError && (
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
              <div className="flex items-baseline gap-2">
                <p className={cn("text-3xl font-bold mt-1", getAverageColor(generalAverage))}>
                  {generalAverage.toFixed(2)}
                </p>
                <span className={cn("text-xs font-medium flex items-center", trend === "up" ? "text-success" : "text-destructive")}>
                  {trend === "up" ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                  +0.2
                </span>
              </div>
            </div>
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", generalAverage >= 5 ? "bg-primary/10" : "bg-destructive/10")}>
              <Award className={cn("w-6 h-6", generalAverage >= 5 ? "text-primary" : "text-destructive")} />
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

      {/* Table */}
      <DataTable
        data={gradesBySubject}
        columns={columns}
        rowKey={(r) => r.rowKey}
        searchable
        searchPlaceholder="Caută materie..."
        loading={isLoading}
        emptyMessage="Nu există note încă."
      />
    </DashboardLayout>
  );
};

export default Grades;
