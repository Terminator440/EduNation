import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FileText, Printer, RefreshCw } from "lucide-react";

import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/utils/exportCsv";

type RoleScope = "teacher" | "homeroom_teacher" | "secretariat" | "director" | "uat_admin";

type DbAttendanceStatus = string;

interface ClassRow {
  id: string;
  name: string;
  year: number | null;
  section: string | null;
}

interface StudentRow {
  id: string;
  student_number: number | null;
  full_name: string | null;
  is_active: boolean | null;
  contact_email: string | null;
  contact_phone: string | null;
}

interface GradeRow {
  id: string;
  date: string;
  grade: number;
  description: string | null;
  student_id: string;
  subjects: { name: string } | null;
}

interface AttendanceRow {
  id: string;
  date: string;
  status: DbAttendanceStatus;
  student_id: string;
  subjects: { name: string } | null;
}

interface RegisterRow {
  id: string;
  register_date: string;
  status: string | null;
  timetable_entries: {
    period: number | null;
    start_time: string | null;
    end_time: string | null;
    weekday: number | null;
    room: string | null;
    classes: { name: string } | null;
    subjects: { name: string } | null;
  } | null;
}

const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Medii din DB (RPC) - nu map/reduce în frontend

const Reports = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [registerRows, setRegisterRows] = useState<RegisterRow[]>([]);
  const [classStatsFromDb, setClassStatsFromDb] = useState<{ student_id: string; general_average: number | null; absences_count: number }[]>([]);
  const [classTotalsFromDb, setClassTotalsFromDb] = useState<{ class_average: number | null; total_absences: number; total_motivated: number } | null>(null);

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>(todayKey());

  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const { user, activeRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const roleOk = (r: any): r is RoleScope =>
    r === "teacher" || r === "homeroom_teacher" || r === "secretariat" || r === "director" || r === "uat_admin";

  useEffect(() => {
    if (!authLoading && (!user || !roleOk(activeRole))) {
      navigate("/auth");
    }
  }, [authLoading, user, activeRole, navigate]);

  const fetchClasses = async () => {
    if (!user || !roleOk(activeRole)) return;
    try {
      if (activeRole === "teacher" || activeRole === "homeroom_teacher") {
        const { data: cls, error } = await supabase
          .from("classes")
          .select("id, name, year, section")
          .eq("teacher_id", user.id)
          .maybeSingle();
        if (error) throw error;
        const arr: ClassRow[] = cls ? [cls as any] : [];
        setClasses(arr);
        setClassId(arr[0]?.id ?? "");
      } else {
        const { data: cls, error } = await supabase
          .from("classes")
          .select("id, name, year, section")
          .order("year", { ascending: true })
          .order("section", { ascending: true });
        if (error) throw error;
        setClasses((cls as any) ?? []);
        setClassId((cls as any)?.[0]?.id ?? "");
      }
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message ?? "Nu am putut încărca clasele.", variant: "destructive" });
    }
  };

  const fetchData = async () => {
    if (!classId) {
      setStudents([]);
      setGrades([]);
      setAttendance([]);
      setRegisterRows([]);
      setClassStatsFromDb([]);
      setClassTotalsFromDb(null);
      setSelectedStudentId("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Use '*' to avoid runtime failures if a deployment is missing some
      // optional columns (e.g., contact_email/contact_phone).
      const { data: st, error: stErr } = await supabase
        .from("students")
        .select("*")
        .eq("class_id", classId)
        .order("student_number", { ascending: true });
      if (stErr) throw stErr;
      const stRows: StudentRow[] = (st as any) ?? [];
      setStudents(stRows);
      setSelectedStudentId((prev) => (prev && stRows.some((s) => s.id === prev) ? prev : (stRows[0]?.id ?? "")));

      const studentIds = stRows.map((s) => s.id);
      if (studentIds.length === 0) {
        setGrades([]);
        setAttendance([]);
        setRegisterRows([]);
        return;
      }

      let gradesQ = supabase
        .from("grades")
        .select("id, date, grade, description, student_id, subjects(name)")
        .in("student_id", studentIds as any)
        .order("date", { ascending: false });
      let attQ = supabase
        .from("attendance")
        .select("id, date, status, student_id, subjects(name)")
        .in("student_id", studentIds as any)
        .order("date", { ascending: false });

      if (dateFrom) {
        gradesQ = gradesQ.gte("date", dateFrom);
        attQ = attQ.gte("date", dateFrom);
      }
      if (dateTo) {
        gradesQ = gradesQ.lte("date", dateTo);
        attQ = attQ.lte("date", dateTo);
      }

      const [{ data: gr, error: grErr }, { data: at, error: atErr }] = await Promise.all([gradesQ, attQ]);
      if (grErr) throw grErr;
      if (atErr) throw atErr;
      setGrades((gr as any) ?? []);
      setAttendance((at as any) ?? []);

      const [{ data: statsData, error: statsErr }, { data: totalsData, error: totalsErr }] = await Promise.all([
        supabase.rpc('get_class_stats_for_display', {
          p_class_id: classId,
          p_date_from: dateFrom || null,
          p_date_to: dateTo || null,
        }),
        supabase.rpc('get_class_totals_for_display', {
          p_class_id: classId,
          p_date_from: dateFrom || null,
          p_date_to: dateTo || null,
        }),
      ]);
      if (!statsErr) setClassStatsFromDb((statsData as any) ?? []);
      if (!totalsErr && totalsData && (totalsData as any[]).length) setClassTotalsFromDb((totalsData as any[])[0]);

      // Teacher register (condică profesor) — best-effort: works only if table + RLS allow access.
      try {
        let regQ: any = (supabase as any)
          .from('teacher_register')
          .select(`
            id,
            register_date,
            status,
            timetable_entries (
              period,
              start_time,
              end_time,
              weekday,
              room,
              classes ( name ),
              subjects ( name )
            )
          `)
          .eq('signed_by', user?.id)
          .order('register_date', { ascending: false });

        if (dateFrom) regQ = regQ.gte('register_date', dateFrom);
        if (dateTo) regQ = regQ.lte('register_date', dateTo);

        const { data: regData } = await regQ;
        setRegisterRows((regData as any) ?? []);
      } catch {
        setRegisterRows([]);
      }
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message ?? "Nu am putut încărca rapoartele.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && roleOk(activeRole)) {
      (async () => {
        setLoading(true);
        await fetchClasses();
        setLoading(false);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeRole]);

  useEffect(() => {
    if (user && roleOk(activeRole)) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, dateFrom, dateTo]);

  const classLabel = useMemo(() => {
    const c = classes.find((x) => x.id === classId);
    if (!c) return "";
    if (c.year && c.section) return `${c.name} (${c.year}${c.section})`;
    return c.name;
  }, [classes, classId]);

  const studentById = useMemo(() => {
    return new Map(students.map((s) => [s.id, s]));
  }, [students]);

  const gradesByStudent = useMemo(() => {
    const m = new Map<string, GradeRow[]>();
    grades.forEach((g) => {
      const arr = m.get(g.student_id) ?? [];
      arr.push(g);
      m.set(g.student_id, arr);
    });
    return m;
  }, [grades]);

  const attendanceByStudent = useMemo(() => {
    const m = new Map<string, AttendanceRow[]>();
    attendance.forEach((a) => {
      const arr = m.get(a.student_id) ?? [];
      arr.push(a);
      m.set(a.student_id, arr);
    });
    return m;
  }, [attendance]);

  const classStats = useMemo(() => {
    const t = classTotalsFromDb;
    return {
      absences: t?.total_absences ?? 0,
      motivated: t?.total_motivated ?? 0,
      avg: t?.class_average ?? null,
    };
  }, [classTotalsFromDb]);

  const classRowsForPrint = useMemo(() => {
    const statsMap = new Map(classStatsFromDb.map((r) => [r.student_id, r]));
    return students.map((s) => {
      const st = statsMap.get(s.id);
      const gs = gradesByStudent.get(s.id) ?? [];
      return {
        ...s,
        avg: st?.general_average ?? null,
        abs: st?.absences_count ?? 0,
        hasGrades: gs.length > 0,
      };
    });
  }, [students, classStatsFromDb, gradesByStudent]);

  const selectedStudent = selectedStudentId ? studentById.get(selectedStudentId) ?? null : null;
  const selectedGrades = selectedStudentId ? gradesByStudent.get(selectedStudentId) ?? [] : [];
  const selectedAttendance = selectedStudentId ? attendanceByStudent.get(selectedStudentId) ?? [] : [];

  const exportStudentsCsv = () => {
    const rows = students.map((s) => ({
      nr_matricol: s.student_number ?? "",
      nume: s.full_name ?? "",
      activ: s.is_active ? "DA" : "NU",
      email_contact: s.contact_email ?? "",
      telefon_contact: s.contact_phone ?? "",
    }));
    exportToCsv(`elevi_${classLabel || "clasa"}.csv`, ["nr_matricol", "nume", "activ", "email_contact", "telefon_contact"], rows);
  };

  const exportGradesCsv = () => {
    const rows = grades.map((g) => ({
      data: g.date,
      elev: studentById.get(g.student_id)?.full_name ?? "",
      materie: g.subjects?.name ?? "",
      nota: g.grade,
      descriere: g.description ?? "",
    }));
    exportToCsv(`note_${classLabel || "clasa"}_${dateFrom || ""}_${dateTo || ""}.csv`, ["data", "elev", "materie", "nota", "descriere"], rows);
  };

  const exportAttendanceCsv = () => {
    const rows = attendance.map((a) => ({
      data: a.date,
      elev: studentById.get(a.student_id)?.full_name ?? "",
      materie: a.subjects?.name ?? "",
      status: a.status,
    }));
    exportToCsv(`absente_prezenta_${classLabel || "clasa"}_${dateFrom || ""}_${dateTo || ""}.csv`, ["data", "elev", "materie", "status"], rows);
  };

  const exportRegisterCsv = () => {
    if (registerRows.length === 0) {
      toast({ title: "Condică", description: "Nu există înregistrări pentru intervalul selectat." });
      return;
    }
    const rows = registerRows.map((r) => ({
      data: r.register_date,
      clasa: r.timetable_entries?.classes?.name ?? "",
      materie: r.timetable_entries?.subjects?.name ?? "",
      ora: r.timetable_entries?.period ?? "",
      interval: `${r.timetable_entries?.start_time ?? ""}-${r.timetable_entries?.end_time ?? ""}`,
      sala: r.timetable_entries?.room ?? "",
      status: r.status ?? "",
    }));
    exportToCsv(
      `condica_${classLabel || "clasa"}_${dateFrom || ""}_${dateTo || ""}.csv`,
      ["data", "clasa", "materie", "ora", "interval", "sala", "status"],
      rows
    );
  };

  const handlePrint = () => {
    window.print();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <main className={cn("transition-all duration-300", sidebarCollapsed ? "ml-20" : "ml-64")}> 
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30 print:hidden">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Rapoarte
            </h1>
            <p className="text-sm text-muted-foreground">Export CSV și pagini print-ready.</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
          </div>
        </header>

        <div className="p-8 space-y-6">
          {/* Filters */}
          <Card className="print:hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Filtre</CardTitle>
              <Button variant="outline" className="gap-2" onClick={fetchData}>
                <RefreshCw className="w-4 h-4" /> Reîncarcă
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label>Clasă</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alege clasa" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.year && c.section ? `${c.name} (${c.year}${c.section})` : c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>De la</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label>Până la</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Content */}
          <Tabs defaultValue="export" className="w-full">
            <TabsList className="print:hidden">
              <TabsTrigger value="export">Export CSV</TabsTrigger>
              <TabsTrigger value="print">Print-ready</TabsTrigger>
              <TabsTrigger value="overview">Rezumat</TabsTrigger>
            </TabsList>

            <TabsContent value="export" className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Export CSV</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="gap-2" onClick={exportStudentsCsv}>
                      <Download className="w-4 h-4" /> Elevi
                    </Button>
                    <Button variant="secondary" className="gap-2" onClick={exportGradesCsv}>
                      <Download className="w-4 h-4" /> Note
                    </Button>
                    <Button variant="secondary" className="gap-2" onClick={exportAttendanceCsv}>
                      <Download className="w-4 h-4" /> Absențe/Prezență
                    </Button>
                    <Button variant="secondary" className="gap-2" onClick={exportRegisterCsv}>
                      <Download className="w-4 h-4" /> Condică profesor
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Exportul se bazează pe clasa selectată și intervalul de date.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Previzualizare rapidă</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[90px]">Nr.</TableHead>
                          <TableHead>Elev</TableHead>
                          <TableHead className="w-[160px]">Medie (interval)</TableHead>
                          <TableHead className="w-[140px]">Absențe</TableHead>
                          <TableHead className="w-[160px]">Alerte</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classRowsForPrint.map((s) => {
                          const alertNoGrades = !s.hasGrades;
                          const alertAbs = s.abs >= 10;
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="text-muted-foreground">{s.student_number ?? "—"}</TableCell>
                              <TableCell className="font-medium">{s.full_name ?? "(fără nume)"}</TableCell>
                              <TableCell>{s.avg == null ? "—" : s.avg.toFixed(2)}</TableCell>
                              <TableCell>{s.abs}</TableCell>
                              <TableCell className="text-sm">
                                {alertNoGrades && <span className="text-warning">Fără note</span>}
                                {alertNoGrades && alertAbs && <span className="text-muted-foreground"> • </span>}
                                {alertAbs && <span className="text-destructive">Absențe multe</span>}
                                {!alertNoGrades && !alertAbs && <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="print" className="space-y-6">
              <Card className="print:hidden">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Pagini print-ready</CardTitle>
                  <Button className="gap-2" onClick={handlePrint}>
                    <Printer className="w-4 h-4" /> Print
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Elev (situație elev)</Label>
                    <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Alege elev" />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {(s.student_number ?? "—") + " • " + (s.full_name ?? "(fără nume)")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground md:self-end">
                    La print se ascund meniul și header-ul; rămâne doar „raportul”.
                  </div>
                </CardContent>
              </Card>

              <div className="bg-background print:p-0">
                <div className="rounded-2xl border border-border p-6 print:border-0 print:p-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold">Situație</h2>
                      <p className="text-muted-foreground">Clasă: {classLabel || "—"}</p>
                      <p className="text-muted-foreground">Interval: {dateFrom || "—"} → {dateTo || "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Generat: {todayKey()}</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    {/* Student report */}
                    <div className="border border-border rounded-xl p-4">
                      <h3 className="font-semibold">Situație elev</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedStudent?.full_name ?? "(alege elev)"} {selectedStudent?.student_number != null ? `(nr. ${selectedStudent.student_number})` : ""}
                      </p>

                      <div className="mt-3 text-sm">
                        <p><span className="text-muted-foreground">Email:</span> {selectedStudent?.contact_email ?? "—"}</p>
                        <p><span className="text-muted-foreground">Telefon:</span> {selectedStudent?.contact_phone ?? "—"}</p>
                      </div>

                      <div className="mt-4">
                        <h4 className="font-medium">Note (interval)</h4>
                        <div className="rounded-lg border border-border overflow-hidden mt-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Materie</TableHead>
                                <TableHead className="w-[90px]">Notă</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedGrades.slice(0, 20).map((g) => (
                                <TableRow key={g.id}>
                                  <TableCell>{g.date}</TableCell>
                                  <TableCell>{g.subjects?.name ?? "—"}</TableCell>
                                  <TableCell>{g.grade}</TableCell>
                                </TableRow>
                              ))}
                              {selectedGrades.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={3} className="text-muted-foreground">—</TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div className="mt-4">
                        <h4 className="font-medium">Absențe/Prezență (interval)</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Absențe: {selectedAttendance.filter((a) => a.status === "absent").length} • Motivate: {selectedAttendance.filter((a) => a.status === "motivat").length}
                        </p>
                      </div>
                    </div>

                    {/* Class report */}
                    <div className="border border-border rounded-xl p-4">
                      <h3 className="font-semibold">Situație clasă</h3>
                      <p className="text-sm text-muted-foreground">Medie (interval): {classStats.avg == null ? "—" : classStats.avg.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">Absențe: {classStats.absences} • Motivate: {classStats.motivated}</p>

                      <div className="rounded-lg border border-border overflow-hidden mt-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">Nr.</TableHead>
                              <TableHead>Elev</TableHead>
                              <TableHead className="w-[120px]">Medie</TableHead>
                              <TableHead className="w-[120px]">Absențe</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {classRowsForPrint.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell className="text-muted-foreground">{s.student_number ?? "—"}</TableCell>
                                <TableCell>{s.full_name ?? "(fără nume)"}</TableCell>
                                <TableCell>{s.avg == null ? "—" : s.avg.toFixed(2)}</TableCell>
                                <TableCell>{s.abs}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>

                  {registerRows.length > 0 && (
                    <div className="mt-6 border border-border rounded-xl p-4">
                      <h3 className="font-semibold">Condică profesor (interval)</h3>
                      <div className="rounded-lg border border-border overflow-hidden mt-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[110px]">Data</TableHead>
                              <TableHead>Clasă</TableHead>
                              <TableHead>Materie</TableHead>
                              <TableHead className="w-[90px]">Ora</TableHead>
                              <TableHead className="w-[110px]">Interval</TableHead>
                              <TableHead className="w-[90px]">Sala</TableHead>
                              <TableHead className="w-[110px]">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {registerRows.slice(0, 40).map((r) => (
                              <TableRow key={r.id}>
                                <TableCell>{r.register_date}</TableCell>
                                <TableCell>{r.timetable_entries?.classes?.name ?? "—"}</TableCell>
                                <TableCell>{r.timetable_entries?.subjects?.name ?? "—"}</TableCell>
                                <TableCell>{r.timetable_entries?.period ?? "—"}</TableCell>
                                <TableCell>
                                  {(r.timetable_entries?.start_time ?? "") + "-" + (r.timetable_entries?.end_time ?? "")}
                                </TableCell>
                                <TableCell>{r.timetable_entries?.room ?? "—"}</TableCell>
                                <TableCell>{r.status ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {registerRows.length > 40 && (
                        <p className="text-xs text-muted-foreground mt-2">Afișez doar primele 40 înregistrări.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Rezumat (interval)</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Elevi</p>
                    <p className="text-2xl font-bold">{students.length}</p>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Medie note</p>
                    <p className="text-2xl font-bold">{classStats.avg == null ? "—" : classStats.avg.toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Absențe</p>
                    <p className="text-2xl font-bold">{classStats.absences}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Alerte simple</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">• „Absențe multe” = ≥ 10 absențe (interval)</p>
                  <p className="text-muted-foreground">• „Fără note” = 0 note (interval)</p>
                  <p className="text-muted-foreground">Aceste praguri sunt ușor de schimbat în cod, fără AI.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Reports;
