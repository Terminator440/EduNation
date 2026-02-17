import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, ClipboardSignature, RefreshCw, CheckCircle, Clock, BookOpen } from "lucide-react";

import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// DB status values: present, unexcused, pending, motivated
type AttendanceStatus = "present" | "unexcused" | "pending";

interface StudentRow {
  id: string;
  student_number: string | number | null;
  full_name: string | null;
}

interface TimetableSlot {
  id: string;
  weekday: number;
  period: number;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  class_id: string | null;
  subject_id: string | null;
  class_name: string;
  subject_name: string;
  signed: boolean;
  register_id: string | null;
}

const WEEKDAY_NAMES = ["", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];

const toDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getJsWeekday = (d: Date): number => {
  // JS: 0=Sun, convert to 1=Mon...7=Sun (matching DB weekday)
  const js = d.getDay();
  return js === 0 ? 7 : js;
};

const TakeAttendance = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const onToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);
  const [loading, setLoading] = useState(true);
  const [dateKey, setDateKey] = useState<string>(toDateKey(new Date()));

  // Timetable slots for today
  const [slots, setSlots] = useState<TimetableSlot[]>([]);

  // Selected slot for attendance
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);

  // Students for selected slot
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [registerNotes, setRegisterNotes] = useState("");

  const { user, activeRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!user || (activeRole !== "teacher" && activeRole !== "homeroom_teacher"))) {
      navigate("/auth");
    }
  }, [authLoading, user, activeRole, navigate]);

  // Fetch timetable slots for selected date
  const fetchSlots = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const selectedDate = new Date(dateKey + "T00:00:00");
      const weekday = getJsWeekday(selectedDate);

      // Get timetable entries for this teacher on this weekday
      const { data: entries, error: entriesErr } = await supabase
        .from("timetable_entries")
        .select("id, weekday, period, start_time, end_time, room, class_id, subject_id")
        .eq("teacher_id", user.id)
        .eq("weekday", weekday)
        .order("period", { ascending: true });

      if (entriesErr) throw entriesErr;

      if (!entries || entries.length === 0) {
        setSlots([]);
        setSelectedSlot(null);
        setLoading(false);
        return;
      }

      // Fetch class names
      const classIds = [...new Set(entries.map(e => e.class_id).filter(Boolean))] as string[];
      const subjectIds = [...new Set(entries.map(e => e.subject_id).filter(Boolean))] as string[];

      const [classesRes, subjectsRes, registerRes] = await Promise.all([
        classIds.length > 0
          ? supabase.from("classes").select("id, name").in("id", classIds)
          : { data: [], error: null },
        subjectIds.length > 0
          ? supabase.from("subjects").select("id, name").in("id", subjectIds)
          : { data: [], error: null },
        supabase
          .from("teacher_register")
          .select("id, timetable_entry_id")
          .eq("teacher_id", user.id)
          .eq("date", dateKey),
      ]);

      type ClassRow = { id: string; name: string };
      type SubjectRow = { id: string; name: string };
      type RegisterRow = { id: string; timetable_entry_id: string };
      const classMap = new Map((classesRes.data || []).map((c: ClassRow) => [c.id, c.name]));
      const subjectMap = new Map((subjectsRes.data || []).map((s: SubjectRow) => [s.id, s.name]));
      const signedMap = new Map((registerRes.data || []).map((r: RegisterRow) => [r.timetable_entry_id, r.id]));

      const mapped: TimetableSlot[] = entries.map((e) => ({
        id: e.id,
        weekday: e.weekday,
        period: e.period,
        start_time: e.start_time,
        end_time: e.end_time,
        room: e.room,
        class_id: e.class_id,
        subject_id: e.subject_id,
        class_name: e.class_id ? classMap.get(e.class_id) || "Necunoscută" : "Necunoscută",
        subject_name: e.subject_id ? subjectMap.get(e.subject_id) || "Necunoscută" : "Necunoscută",
        signed: signedMap.has(e.id),
        register_id: signedMap.get(e.id) || null,
      }));

      setSlots(mapped);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Nu am putut încărca orarul.";
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (activeRole === "teacher" || activeRole === "homeroom_teacher")) {
      fetchSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeRole, dateKey]);

  // When a slot is selected, fetch students
  const handleSelectSlot = async (slot: TimetableSlot) => {
    setSelectedSlot(slot);
    setSearch("");

    if (!slot.class_id) {
      setStudents([]);
      return;
    }

    try {
      const { data: studentsData, error } = await supabase
        .from("students")
        .select("id, student_number, full_name")
        .eq("class_id", slot.class_id)
        .order("student_number", { ascending: true });

      if (error) throw error;

      const studentList = (studentsData || []) as StudentRow[];
      setStudents(studentList);

      // Load existing attendance for this date + subject
      if (slot.subject_id) {
        const studentIds = studentList.map(s => s.id);
        if (studentIds.length > 0) {
          const { data: existingAttendance } = await supabase
            .from("attendance")
            .select("student_id, status")
            .eq("subject_id", slot.subject_id)
            .eq("date", dateKey)
            .in("student_id", studentIds);

          const existingMap: Record<string, AttendanceStatus> = {};
          type ExistingAttendanceRow = { student_id: string; status: AttendanceStatus };
          ((existingAttendance ?? []) as ExistingAttendanceRow[]).forEach((a) => {
            existingMap[a.student_id] = a.status;
          });

          const initial: Record<string, AttendanceStatus> = {};
          studentList.forEach((s) => {
            initial[s.id] = existingMap[s.id] || "present";
          });
          setStatuses(initial);
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Nu am putut încărca elevii.";
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Sign register (condica)
  const handleSignRegister = async (slot: TimetableSlot) => {
    if (!user || slot.signed) return;
    setSigning(true);
    try {
      const { error } = await supabase.from("teacher_register").insert({
        timetable_entry_id: slot.id,
        teacher_id: user.id,
        class_id: slot.class_id,
        subject_id: slot.subject_id,
        date: dateKey,
        notes: registerNotes.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Condică semnată!",
        description: `${slot.subject_name} — ${slot.class_name}, ora ${slot.period}`,
      });

      setRegisterNotes("");
      // Refresh and auto-select for attendance
      await fetchSlots();
      // Re-select the slot with signed=true
      handleSelectSlot({ ...slot, signed: true });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Nu s-a putut semna condica.";
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  };

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
    if (!user || !selectedSlot?.subject_id) return;

    const rows = students.map((s) => ({
      student_id: s.id,
      subject_id: selectedSlot.subject_id!,
      status: statuses[s.id] ?? "present",
      teacher_id: user.id,
      date: dateKey,
    }));

    setSaving(true);
    try {
      type AttendanceInsert = Database["public"]["Tables"]["attendance"]["Insert"];
      const { error } = await supabase
        .from("attendance")
        .upsert(rows as AttendanceInsert[], { onConflict: "student_id,subject_id,date" });
      if (error) throw error;

      toast({
        title: "Prezența salvată!",
        description: `${selectedSlot.subject_name} — ${selectedSlot.class_name} (${dateKey})`,
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Nu am putut salva prezența.";
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const todayWeekday = getJsWeekday(new Date(dateKey + "T00:00:00"));

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />

      <main className={cn("w-full min-w-0 transition-all duration-300 pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64")}>
        <header className="w-full h-16 border-b border-border bg-card flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              Condică & Prezență
            </h1>
            <p className="text-sm text-muted-foreground">Semnează condica și fă prezența pentru orele tale.</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
          </div>
        </header>

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Date selector */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={dateKey}
                    onChange={(e) => { setDateKey(e.target.value); setSelectedSlot(null); }}
                    className="w-48"
                  />
                </div>
                <div className="flex items-center gap-2 mt-5 sm:mt-0">
                  <Badge variant="outline" className="text-sm">
                    {WEEKDAY_NAMES[todayWeekday] || "Necunoscut"}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={fetchSlots} disabled={loading} className="gap-2">
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    Reîncarcă
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timetable slots */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Orarul zilei — {WEEKDAY_NAMES[todayWeekday]}
              </CardTitle>
              <CardDescription>
                Selectează o oră pentru a semna condica și a face prezența.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : slots.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nu ai ore programate în această zi.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className={cn(
                        "p-4 rounded-lg border-2 cursor-pointer transition-all",
                        selectedSlot?.id === slot.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50",
                        slot.signed && "bg-green-500/5"
                      )}
                      onClick={() => handleSelectSlot(slot)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground">Ora {slot.period}</span>
                        {slot.signed ? (
                          <Badge variant="default" className="bg-green-600 text-white gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Semnată
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Clock className="w-3 h-3" />
                            Nesemnată
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground">{slot.subject_name}</p>
                      <p className="text-sm text-muted-foreground">{slot.class_name}</p>
                      {(slot.start_time || slot.end_time) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {slot.start_time} — {slot.end_time}
                          {slot.room && ` • Sala ${slot.room}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sign register + attendance */}
          {selectedSlot && (
            <>
              {/* Sign register if not signed */}
              {!selectedSlot.signed && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardSignature className="w-5 h-5" />
                      Semnează Condica
                    </CardTitle>
                    <CardDescription>
                      Ora {selectedSlot.period}: {selectedSlot.subject_name} — {selectedSlot.class_name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Observații (opțional)</Label>
                      <Textarea
                        value={registerNotes}
                        onChange={(e) => setRegisterNotes(e.target.value)}
                        placeholder="ex: Tema nouă, test programat..."
                        className="mt-1"
                      />
                    </div>
                    <Button onClick={() => handleSignRegister(selectedSlot)} disabled={signing} className="gap-2">
                      <ClipboardSignature className="w-4 h-4" />
                      {signing ? "Se semnează..." : "Semnează Condica"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Attendance form */}
              <Card>
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardCheck className="w-5 h-5" />
                      Prezența — {selectedSlot.subject_name}
                    </CardTitle>
                    <CardDescription>{selectedSlot.class_name} • {dateKey}</CardDescription>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2 md:items-center">
                    <Input
                      placeholder="Caută elev..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="md:w-64"
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setAll("present")}>Toți prezenți</Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setAll("unexcused")}>Toți absenți</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {students.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nu sunt elevi în această clasă.</p>
                  ) : (
                    <>
                      <div className="rounded-xl border border-border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-full">Nr.</TableHead>
                              <TableHead>Elev</TableHead>
                              <TableHead className="w-full">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredStudents.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell className="text-muted-foreground">{s.student_number ?? "—"}</TableCell>
                                <TableCell className="font-medium">{s.full_name ?? "(fără nume)"}</TableCell>
                                <TableCell>
                                  <Select
                                    value={statuses[s.id] ?? "present"}
                                    onValueChange={(v) =>
                                      setStatuses((prev) => ({ ...prev, [s.id]: v as AttendanceStatus }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="present">Prezent</SelectItem>
                                      <SelectItem value="unexcused">Absent (nemotivat)</SelectItem>
                                      <SelectItem value="pending">Întârziat / În așteptare</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex justify-end mt-4">
                        <Button onClick={handleSave} disabled={saving || !selectedSlot.subject_id} className="gap-2">
                          <ClipboardCheck className="w-4 h-4" />
                          {saving ? "Se salvează..." : "Salvează prezența"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default TakeAttendance;
