import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, RefreshCw } from "lucide-react";

import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type AttendanceStatus = "prezent" | "absent" | "intarziat";

interface StudentRow {
  id: string;
  student_number: number | null;
  full_name: string | null;
}

interface SubjectRow {
  id: string;
  name: string;
}

const toDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const TakeAttendance = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [classId, setClassId] = useState<string | null>(null);
  const [className, setClassName] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [dateKey, setDateKey] = useState<string>(toDateKey(new Date()));
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);

  const { user, activeRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!user || (activeRole !== "teacher" && activeRole !== "homeroom_teacher"))) {
      navigate("/auth");
    }
  }, [authLoading, user, activeRole, navigate]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Teacher's class (for homeroom_teacher, this is the homeroom class; for teacher, we assume a primary class)
      const { data: cls, error: clsErr } = await supabase
        .from("classes")
        .select("id, name")
        .eq("teacher_id", user.id)
        .maybeSingle();
      if (clsErr) throw clsErr;

      if (!cls?.id) {
        setClassId(null);
        setClassName(null);
        setStudents([]);
        setSubjects([]);
        return;
      }
      setClassId(cls.id);
      setClassName(cls.name ?? "Clasa mea");

      const [{ data: st, error: stErr }, { data: subj, error: subjErr }] = await Promise.all([
        supabase
          .from("students")
          .select("id, student_number, full_name")
          .eq("class_id", cls.id)
          .order("student_number", { ascending: true }),
        supabase
          .from("subjects")
          .select("id, name")
          .eq("class_id", cls.id)
          .order("name", { ascending: true }),
      ]);
      if (stErr) throw stErr;
      if (subjErr) throw subjErr;

      setStudents((st as any) ?? []);
      setSubjects((subj as any) ?? []);

      // Keep subject selection if still valid
      if (subjectId && !(subj ?? []).some((s: any) => s.id === subjectId)) {
        setSubjectId("");
      }

      // Initialize statuses
      const initial: Record<string, AttendanceStatus> = {};
      (st ?? []).forEach((s: any) => {
        initial[s.id] = statuses[s.id] ?? "prezent";
      });
      setStatuses(initial);
    } catch (e: any) {
      toast({
        title: "Eroare",
        description: e?.message ?? "Nu am putut încărca datele pentru prezență.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (activeRole === "teacher" || activeRole === "homeroom_teacher")) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeRole]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => (s.full_name ?? "").toLowerCase().includes(q));
  }, [students, search]);

  const setAll = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = { ...statuses };
    filteredStudents.forEach((s) => {
      next[s.id] = status;
    });
    setStatuses(next);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!classId) {
      toast({ title: "Fără clasă", description: "Nu ai o clasă asociată.", variant: "destructive" });
      return;
    }
    if (!subjectId) {
      toast({ title: "Date incomplete", description: "Selectează materia.", variant: "destructive" });
      return;
    }
    if (!dateKey) {
      toast({ title: "Date incomplete", description: "Alege data.", variant: "destructive" });
      return;
    }

    const rows = students.map((s) => ({
      student_id: s.id,
      subject_id: subjectId,
      status: statuses[s.id] ?? "prezent",
      teacher_id: user.id,
      date: dateKey,
    }));

    setSaving(true);
    try {
      // Use upsert to avoid duplicate-key errors (unique constraint on student_id+subject_id+date).
      const { error } = await (supabase as any)
        .from("attendance")
        .upsert(rows, { onConflict: "student_id,subject_id,date" });
      if (error) throw error;

      toast({
        title: "Salvat",
        description: `Prezența a fost înregistrată pentru ${className ?? "clasă"} (${dateKey}).`,
      });
    } catch (e: any) {
      toast({
        title: "Eroare",
        description: e?.message ?? "Nu am putut salva prezența.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
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

      <main
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "ml-20" : "ml-64"
        )}
      >
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              Fă prezența
            </h1>
            <p className="text-sm text-muted-foreground">Înregistrează prezența pentru întreaga clasă.</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
          </div>
        </header>

        <div className="p-8 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Setări</CardTitle>
              <Button variant="outline" onClick={fetchData} disabled={loading} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Reîncarcă
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Clasă</Label>
                <Input value={className ?? "(neatribuit)"} readOnly />
              </div>
              <div>
                <Label>Materie</Label>
                <Select value={subjectId} onValueChange={setSubjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alege materia" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Elevi</CardTitle>
              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <Input
                  placeholder="Caută elev..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="md:w-64"
                />
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setAll("prezent")}>Toți prezenți</Button>
                  <Button type="button" variant="secondary" onClick={() => setAll("absent")}>Toți absenți</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Nr.</TableHead>
                      <TableHead>Elev</TableHead>
                      <TableHead className="w-[220px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground">{s.student_number ?? "—"}</TableCell>
                        <TableCell className="font-medium">{s.full_name ?? "(fără nume)"}</TableCell>
                        <TableCell>
                          <Select
                            value={statuses[s.id] ?? "prezent"}
                            onValueChange={(v) =>
                              setStatuses((prev) => ({ ...prev, [s.id]: v as AttendanceStatus }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="prezent">Prezent</SelectItem>
                              <SelectItem value="absent">Absent</SelectItem>
                              <SelectItem value="intarziat">Întârziat</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={handleSave} disabled={saving || !classId} className="gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  {saving ? "Se salvează..." : "Salvează prezența"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default TakeAttendance;
