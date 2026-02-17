import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, GraduationCap, UserCircle, TrendingUp, Plus, Search, MessageSquare, CheckCircle, ClipboardSignature } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchGradesForStudents } from "@/features/grades/services/grades.service";
import { fetchAttendanceForStudents } from "@/features/attendance/services/attendance.service";
import type { GradeRow } from "@/features/grades/services/grades.service";
import type { AttendanceRow } from "@/features/attendance/services/attendance.service";
import { CreateInvitationDialog } from "@/components/invitations/CreateInvitationDialog";
import {
  listInvitations,
  revokeInvitation,
  getRoleLabelRo,
  getStatusLabelRo,
  getInvitationStatus,
  type InvitationRole,
  type InvitationWithDetails,
} from "@/lib/invitations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Student {
  id: string;
  user_id: string | null;
  student_number: number | null;
  full_name: string | null;
  profile: {
    full_name: string | null;
    email: string;
  } | null;
  grades: {
    id: string;
    grade: number;
    date: string;
    subject: {
      name: string;
    };
  }[];
  attendance: {
    id: string;
    status: string;
    date: string;
    subject: {
      name: string;
    };
  }[];
}

interface Subject {
  id: string;
  name: string;
}

interface TimetableEntry {
  id: string;
  weekday: number;
  period: number;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  class_id?: string | null;
  subject_id?: string | null;
  classes?: { name: string } | null;
  subjects?: { name: string } | null;
}

const TeacherDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAddGradeOpen, setIsAddGradeOpen] = useState(false);
  const [isAddAttendanceOpen, setIsAddAttendanceOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [isMotivateOpen, setIsMotivateOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [newGrade, setNewGrade] = useState({ grade: "", subjectId: "", description: "" });
  const [newAttendance, setNewAttendance] = useState({ status: "present", subjectId: "" });
  const [message, setMessage] = useState({ subject: "", content: "", sendToParent: true, sendToStudent: false });
  const [selectedAbsences, setSelectedAbsences] = useState<string[]>([]);
  const [motivateReason, setMotivateReason] = useState("");
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [signedEntryIds, setSignedEntryIds] = useState<Set<string>>(new Set());
  const [registerLoading, setRegisterLoading] = useState(false);

  // Invitatii (doar pentru diriginte)
  const [invitationDialogOpen, setInvitationDialogOpen] = useState(false);
  const [invitationRole, setInvitationRole] = useState<InvitationRole>("student");
  const [homeroomClassId, setHomeroomClassId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [homeroomInvitations, setHomeroomInvitations] = useState<InvitationWithDetails[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);


  const { user, activeRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!user || (activeRole !== 'teacher' && activeRole !== 'homeroom_teacher'))) {
      navigate('/auth');
    }
  }, [user, activeRole, authLoading, navigate]);

  useEffect(() => {
    if (user && (activeRole === 'teacher' || activeRole === 'homeroom_teacher')) {
      fetchData();
      fetchRegister();
    }
  }, [user, activeRole]);
  useEffect(() => {
    const loadHomeroomContext = async () => {
      try {
        if (!user || activeRole !== "homeroom_teacher") return;

        setInvitesLoading(true);

        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("school_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profileErr) throw profileErr;

        const sid = profileData?.school_id ?? null;
        setSchoolId(sid);

        const { data: classData, error: classErr } = await supabase
          .from("classes")
          .select("id")
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (classErr) throw classErr;

        const cid = classData?.id ?? null;
        setHomeroomClassId(cid);

        if (sid && cid) {
          const invs = await listInvitations({ schoolId: sid, classId: cid, limit: 50 });
          setHomeroomInvitations(invs);
        } else {
          setHomeroomInvitations([]);
        }
      } catch (e) {
        console.error("Failed to load homeroom invitations:", e);
        setHomeroomInvitations([]);
      } finally {
        setInvitesLoading(false);
      }
    };

    void loadHomeroomContext();
  }, [user, activeRole]);


  const toDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getJsWeekday = (d: Date): number => {
    const js = d.getDay();
    return js === 0 ? 7 : js;
  };

  const fetchRegister = async () => {
    if (!user) return;
    setRegisterLoading(true);
    try {
      const today = new Date();
      const weekday = getJsWeekday(today);
      const dateStr = toDateKey(today);

      const { data: entries, error: entriesErr } = await supabase
        .from("timetable_entries")
        .select("id, weekday, period, start_time, end_time, room, class_id, subject_id")
        .eq("teacher_id", user.id)
        .eq("weekday", weekday)
        .order("period", { ascending: true });

      if (entriesErr) throw entriesErr;

      if (!entries || entries.length === 0) {
        setTimetableEntries([]);
        setSignedEntryIds(new Set());
        return;
      }

      // Fetch class + subject names
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
          .eq("date", dateStr),
      ]);

      type IdNameRow = { id: string; name: string };
      type RegisterRow = { timetable_entry_id: string };
      const classMap = new Map(((classesRes.data ?? []) as IdNameRow[]).map((c) => [c.id, c.name]));
      const subjectMap = new Map(((subjectsRes.data ?? []) as IdNameRow[]).map((s) => [s.id, s.name]));
      const signedIds = new Set(((registerRes.data ?? []) as RegisterRow[]).map((r) => r.timetable_entry_id));

      const mapped: TimetableEntry[] = entries.map((e) => ({
        id: e.id,
        weekday: e.weekday,
        period: e.period,
        start_time: e.start_time,
        end_time: e.end_time,
        room: e.room,
        class_id: e.class_id,
        subject_id: e.subject_id,
        classes: e.class_id ? { name: classMap.get(e.class_id) || "Necunoscută" } : null,
        subjects: e.subject_id ? { name: subjectMap.get(e.subject_id) || "Necunoscută" } : null,
      }));

      setTimetableEntries(mapped);
      setSignedEntryIds(signedIds);
    } catch (e: unknown) {
      console.error("Error fetching register:", e);
      setTimetableEntries([]);
      setSignedEntryIds(new Set());
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleSignRegister = async (timetableEntryId: string) => {
    if (!user) return;
    try {
      const entry = timetableEntries.find(e => e.id === timetableEntryId);
      const dateStr = toDateKey(new Date());

      const { error } = await supabase.from("teacher_register").insert({
        timetable_entry_id: timetableEntryId,
        teacher_id: user.id,
        class_id: entry?.class_id || null,
        subject_id: entry?.subject_id || null,
        date: dateStr,
      });

      if (error) throw error;

      toast({
        title: "Condică semnată!",
        description: `Ora ${entry?.period ?? ''} — ${entry?.subjects?.name ?? 'Materie'}`,
      });

      setSignedEntryIds(prev => new Set([...prev, timetableEntryId]));
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Nu s-a putut semna condica.";
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: classData } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', user?.id)
        .maybeSingle();

      if (classData) {
        const { data: studentsData } = await supabase
          .from('students')
          .select(`
            id,
            user_id,
            student_number,
            full_name
          `)
          .eq('class_id', classData.id);

        if (studentsData) {
          // Fetch related data in bulk to avoid N+1 queries (production performance)
          type StudentListRow = {
            id: string;
            user_id: string | null;
            student_number: number | null;
            full_name: string | null;
          };
          const studentRows = (studentsData ?? []) as StudentListRow[];
          const studentIds = studentRows.map((s) => s.id);
          const userIds = studentRows
            .map((s) => s.user_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0);

          type ProfileLite = { id: string; full_name: string | null; email: string };
          const profilesById = new Map<string, ProfileLite>();
          if (userIds.length > 0) {
            const { data: profilesData, error: profilesErr } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', userIds);

            if (profilesErr) throw profilesErr;
            ((profilesData ?? []) as ProfileLite[]).forEach((p) => profilesById.set(p.id, p));
          }

          // Use services from features instead of direct Supabase calls
          const [gradesData, attendanceData] = await Promise.all([
            fetchGradesForStudents(studentIds),
            fetchAttendanceForStudents(studentIds),
          ]);

          const gradesByStudent = new Map<string, Student["grades"]>();
          (gradesData as GradeRow[]).forEach((g) => {
            const arr = gradesByStudent.get(g.student_id) ?? [];
            arr.push({
              id: g.id,
              grade: g.grade,
              date: g.date,
              subject: { name: g.subject?.name ?? "Materie" },
            });
            gradesByStudent.set(g.student_id, arr);
          });

          const attendanceByStudent = new Map<string, Student["attendance"]>();
          (attendanceData as AttendanceRow[]).forEach((a) => {
            const arr = attendanceByStudent.get(a.student_id) ?? [];
            arr.push({
              id: a.id,
              status: a.status,
              date: a.date,
              subject: { name: a.subject?.name ?? "Materie" },
            });
            attendanceByStudent.set(a.student_id, arr);
          });

          const enrichedStudents: Student[] = studentRows.map((student) => ({
            id: student.id,
            user_id: student.user_id,
            student_number: student.student_number,
            full_name: student.full_name,
            profile: student.user_id ? profilesById.get(student.user_id) ?? null : null,
            grades: gradesByStudent.get(student.id) ?? [],
            attendance: attendanceByStudent.get(student.id) ?? [],
          }));

          setStudents(enrichedStudents);
        }

        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('class_id', classData.id);

        setSubjects(subjectsData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGrade = async () => {
    if (!selectedStudent || !newGrade.grade || !newGrade.subjectId) {
      toast({
        title: "Eroare",
        description: "Completează toate câmpurile obligatorii",
        variant: "destructive",
      });
      return;
    }

    const gradeValue = parseFloat(newGrade.grade);
    if (gradeValue < 1 || gradeValue > 10) {
      toast({
        title: "Eroare",
        description: "Nota trebuie să fie între 1 și 10",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from('grades').insert({
        student_id: selectedStudent.id,
        subject_id: newGrade.subjectId,
        grade: gradeValue,
        description: newGrade.description || null,
        teacher_id: user?.id,
        date: new Date().toISOString().split('T')[0],
      });

      if (error) throw error;

      toast({
        title: "Notă adăugată",
        description: `Nota ${gradeValue} a fost adăugată pentru ${selectedStudent.full_name || selectedStudent.profile?.full_name}`,
      });

      setIsAddGradeOpen(false);
      setNewGrade({ grade: "", subjectId: "", description: "" });
      fetchData();
    } catch (error) {
      console.error('Error adding grade:', error);
      toast({
        title: "Eroare",
        description: "Nu s-a putut adăuga nota",
        variant: "destructive",
      });
    }
  };

  const handleAddAttendance = async () => {
    if (!selectedStudent || !newAttendance.subjectId) {
      toast({
        title: "Eroare",
        description: "Selectează materia",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from('attendance').insert({
        student_id: selectedStudent.id,
        subject_id: newAttendance.subjectId,
        status: newAttendance.status,
        teacher_id: user?.id,
        date: new Date().toISOString().split('T')[0],
      });

      if (error) throw error;

      toast({
        title: "Prezență înregistrată",
        description: `Statusul "${newAttendance.status}" a fost înregistrat pentru ${selectedStudent.full_name || selectedStudent.profile?.full_name}`,
      });

      setIsAddAttendanceOpen(false);
      setNewAttendance({ status: "present", subjectId: "" });
      fetchData();
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
      if (code === '23505') {
        toast({
          title: "Eroare",
          description: "Prezența pentru această dată și materie a fost deja înregistrată",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Eroare",
          description: "Nu s-a putut înregistra prezența",
          variant: "destructive",
        });
      }
    }
  };

  const handleMotivateAbsences = async () => {
    if (activeRole !== 'homeroom_teacher') {
      toast({
        title: "Acces restricționat",
        description: "Doar dirigintele poate motiva absențe.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedStudent || selectedAbsences.length === 0) {
      toast({
        title: "Eroare",
        description: "Selectează absențele de motivat",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('attendance')
        .update({
          status: 'motivated',
          excuse_reason: motivateReason.trim() ? motivateReason.trim() : null,
          excused_at: new Date().toISOString(),
        })
        .in('id', selectedAbsences);

      if (error) throw error;

      toast({
        title: "Absențe motivate",
        description: `${selectedAbsences.length} absențe au fost motivate pentru ${selectedStudent.full_name || selectedStudent.profile?.full_name}`,
      });

      setIsMotivateOpen(false);
      setSelectedAbsences([]);
      setMotivateReason("");
      fetchData();
    } catch (error) {
      console.error('Error motivating absences:', error);
      toast({
        title: "Eroare",
        description: "Nu s-au putut motiva absențele",
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async () => {
    if (!selectedStudent || !message.content.trim()) {
      toast({
        title: "Eroare",
        description: "Completează mesajul",
        variant: "destructive",
      });
      return;
    }

    // Simulate sending message (in a real app, this would send emails/notifications)
    toast({
      title: "Mesaj trimis",
      description: `Mesajul a fost trimis ${message.sendToParent ? 'părintelui' : ''} ${message.sendToParent && message.sendToStudent ? 'și' : ''} ${message.sendToStudent ? 'elevului' : ''}`,
    });

    setIsMessageOpen(false);
    setMessage({ subject: "", content: "", sendToParent: true, sendToStudent: false });
  };

  const calculateAverage = (grades: { grade: number }[]) => {
    if (grades.length === 0) return "-";
    const sum = grades.reduce((acc, g) => acc + Number(g.grade), 0);
    return (sum / grades.length).toFixed(2);
  };

  const countAbsences = (attendance: { status: string }[]) => {
    return attendance.filter(a => ['unexcused', 'pending'].includes(a.status)).length;
  };

  const getUnmotivatedAbsences = (attendance: { id: string; status: string; date: string; subject: { name: string } }[]) => {
    return attendance.filter(a => ['unexcused', 'pending'].includes(a.status));
  };

  const filteredStudents = students.filter(s =>
    (s.full_name || s.profile?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalGrades = students.reduce((acc, s) => acc + s.grades.length, 0);
  const totalAbsences = students.reduce((acc, s) => acc + countAbsences(s.attendance), 0);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Panou Profesor"
      subtitle="Gestionează elevii clasei tale"
    >
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Total Elevi"
              value={students.length.toString()}
              subtitle="În clasă"
              icon={Users}
              variant="primary"
            />
            <StatsCard
              title="Note Date"
              value={totalGrades.toString()}
              subtitle="Total"
              icon={GraduationCap}
              variant="success"
            />
            <StatsCard
              title="Absențe"
              value={totalAbsences.toString()}
              subtitle="Nemotivate"
              icon={UserCircle}
              variant="warning"
            />
            <StatsCard
              title="Materii"
              value={subjects.length.toString()}
              subtitle="Predate"
              icon={TrendingUp}
              variant="accent"
            />
          </div>

          {/* Condică (teacher register) */}
          <div className="bg-card rounded-xl border border-border p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <ClipboardSignature className="w-5 h-5" />
                  Condică azi
                </h2>
                <p className="text-sm text-muted-foreground">Semnează orele din orar pentru ziua curentă.</p>
              </div>
              <Button variant="outline" onClick={fetchRegister} disabled={registerLoading}>
                Reîncarcă
              </Button>
            </div>

            {registerLoading ? (
              <div className="text-muted-foreground">Se încarcă...</div>
            ) : timetableEntries.length === 0 ? (
              <div className="text-muted-foreground">Nu există ore în orar pentru azi (sau nu sunt alocate pe contul tău).</div>
            ) : (
              <div className="space-y-2">
                {timetableEntries.map((e) => {
                  const isSigned = signedEntryIds.has(e.id);
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          Ora {e.period} • {e.subjects?.name ?? 'Materie'} • {e.classes?.name ?? 'Clasă'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {e.start_time ?? ''}{e.end_time ? `–${e.end_time}` : ''}{e.room ? ` • Sala ${e.room}` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSignRegister(e.id)}
                        disabled={isSigned}
                        className="shrink-0"
                      >
                        {isSigned ? 'Semnat' : 'Semnează'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Students table */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Elevii Clasei</h2>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Caută elev..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {students.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nu ai elevi în clasă încă.</p>
                <p className="text-sm mt-2">Contactează administratorul pentru a adăuga elevi.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr.</TableHead>
                    <TableHead>Nume Elev</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Media</TableHead>
                    <TableHead>Absențe</TableHead>
                    <TableHead>Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student, index) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.student_number || index + 1}</TableCell>
                      <TableCell className="font-medium">{student.full_name || student.profile?.full_name || 'Nespecificat'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {student.grades.slice(0, 5).map((g) => (
                            <span
                              key={g.id}
                              className={cn(
                                "px-2 py-0.5 rounded text-xs font-medium",
                                Number(g.grade) >= 9 ? "bg-success/10 text-success" :
                                Number(g.grade) >= 7 ? "bg-primary/10 text-primary" :
                                Number(g.grade) >= 5 ? "bg-warning/10 text-warning" :
                                "bg-destructive/10 text-destructive"
                              )}
                            >
                              {Number(g.grade).toFixed(0)}
                            </span>
                          ))}
                          {student.grades.length > 5 && (
                            <span className="text-xs text-muted-foreground">+{student.grades.length - 5}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "font-semibold",
                          parseFloat(calculateAverage(student.grades)) >= 9 ? "text-success" :
                          parseFloat(calculateAverage(student.grades)) >= 7 ? "text-primary" :
                          parseFloat(calculateAverage(student.grades)) >= 5 ? "text-warning" :
                          "text-destructive"
                        )}>
                          {calculateAverage(student.grades)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          countAbsences(student.attendance) > 5 ? "text-destructive" :
                          countAbsences(student.attendance) > 2 ? "text-warning" :
                          "text-muted-foreground"
                        )}>
                          {countAbsences(student.attendance)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 flex-wrap">
                          {/* Add Grade Dialog */}
                          <Dialog open={isAddGradeOpen && selectedStudent?.id === student.id} onOpenChange={(open) => {
                            setIsAddGradeOpen(open);
                            if (open) setSelectedStudent(student);
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="gap-1">
                                <Plus className="w-3 h-3" />
                                Notă
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Adaugă notă pentru {student.full_name || student.profile?.full_name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                <div>
                                  <Label>Materie</Label>
                                  <Select value={newGrade.subjectId || undefined} onValueChange={(v) => setNewGrade(p => ({ ...p, subjectId: v }))} disabled={subjects.length === 0}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder={subjects.length === 0 ? "Nu există materii" : "Selectează materia"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {subjects.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Nota (1-10)</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="10"
                                    step="0.01"
                                    value={newGrade.grade}
                                    onChange={(e) => setNewGrade(p => ({ ...p, grade: e.target.value }))}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label>Descriere (opțional)</Label>
                                  <Input
                                    value={newGrade.description}
                                    onChange={(e) => setNewGrade(p => ({ ...p, description: e.target.value }))}
                                    placeholder="ex: Test capitol 3"
                                    className="mt-1"
                                  />
                                </div>
                                <Button onClick={handleAddGrade} className="w-full">
                                  Salvează nota
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>

                          {/* Add Attendance Dialog */}
                          <Dialog open={isAddAttendanceOpen && selectedStudent?.id === student.id} onOpenChange={(open) => {
                            setIsAddAttendanceOpen(open);
                            if (open) setSelectedStudent(student);
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="gap-1">
                                <Plus className="w-3 h-3" />
                                Pune absențe
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Înregistrează absențe/prezența pentru {student.full_name || student.profile?.full_name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                <div>
                                  <Label>Materie</Label>
                                  <Select value={newAttendance.subjectId || undefined} onValueChange={(v) => setNewAttendance(p => ({ ...p, subjectId: v }))} disabled={subjects.length === 0}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder={subjects.length === 0 ? "Nu există materii" : "Selectează materia"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {subjects.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Status</Label>
                                  <Select value={newAttendance.status} onValueChange={(v) => setNewAttendance(p => ({ ...p, status: v }))}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="present">Prezent</SelectItem>
                                      <SelectItem value="unexcused">Absent (nemotivat)</SelectItem>
                                      <SelectItem value="pending">Întârziat / În așteptare</SelectItem>
                                      <SelectItem value="motivated">Motivat</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Button onClick={handleAddAttendance} className="w-full">
                                  Salvează
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>

                          {/* Motivate Absences Dialog */}
                          {activeRole === 'homeroom_teacher' && (
<Dialog open={isMotivateOpen && selectedStudent?.id === student.id} onOpenChange={(open) => {
                            setIsMotivateOpen(open);
                            if (open) {
                              setSelectedStudent(student);
                              setSelectedAbsences([]);
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="gap-1" disabled={countAbsences(student.attendance) === 0}>
                                <CheckCircle className="w-3 h-3" />
                                Motivează
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Motivează absențe pentru {student.full_name || student.profile?.full_name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                {getUnmotivatedAbsences(student.attendance).length === 0 ? (
                                  <p className="text-muted-foreground text-center py-4">Nu există absențe de motivat.</p>
                                ) : (
                                  <>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                      {getUnmotivatedAbsences(student.attendance).map((absence) => (
                                        <label
                                          key={absence.id}
                                          className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                            selectedAbsences.includes(absence.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                                          )}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedAbsences.includes(absence.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setSelectedAbsences([...selectedAbsences, absence.id]);
                                              } else {
                                                setSelectedAbsences(selectedAbsences.filter(id => id !== absence.id));
                                              }
                                            }}
                                            className="rounded border-border"
                                          />
                                          <div>
                                            <p className="font-medium">{absence.subject?.name}</p>
                                            <p className="text-sm text-muted-foreground">{absence.date}</p>
                                          </div>
                                        </label>
                                      ))}
                                    </div>
                                    <div>
                                      <Label>Motiv (opțional)</Label>
                                      <Textarea
                                        value={motivateReason}
                                        onChange={(e) => setMotivateReason(e.target.value)}
                                        placeholder="ex: Adeverință medicală / motivare părinte"
                                        className="mt-1"
                                      />
                                    </div>
                                    <Button onClick={handleMotivateAbsences} className="w-full" disabled={selectedAbsences.length === 0}>
                                      Motivează ({selectedAbsences.length}) absențe
                                    </Button>
                                  </>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                          )}


                          {/* Send Message Dialog */}
                          <Dialog open={isMessageOpen && selectedStudent?.id === student.id} onOpenChange={(open) => {
                            setIsMessageOpen(open);
                            if (open) setSelectedStudent(student);
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="gap-1">
                                <MessageSquare className="w-3 h-3" />
                                Mesaj
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Trimite mesaj pentru {student.full_name || student.profile?.full_name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                <div>
                                  <Label>Destinatari</Label>
                                  <div className="flex gap-4 mt-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={message.sendToParent}
                                        onChange={(e) => setMessage(p => ({ ...p, sendToParent: e.target.checked }))}
                                        className="rounded border-border"
                                      />
                                      <span className="text-sm">Părinte</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={message.sendToStudent}
                                        onChange={(e) => setMessage(p => ({ ...p, sendToStudent: e.target.checked }))}
                                        className="rounded border-border"
                                      />
                                      <span className="text-sm">Elev</span>
                                    </label>
                                  </div>
                                </div>
                                <div>
                                  <Label>Subiect</Label>
                                  <Input
                                    value={message.subject}
                                    onChange={(e) => setMessage(p => ({ ...p, subject: e.target.value }))}
                                    placeholder="Subiectul mesajului"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label>Mesaj</Label>
                                  <Textarea
                                    value={message.content}
                                    onChange={(e) => setMessage(p => ({ ...p, content: e.target.value }))}
                                    placeholder="Scrie mesajul aici..."
                                    className="mt-1 min-h-[100px]"
                                  />
                                </div>
                                <Button 
                                  onClick={handleSendMessage} 
                                  className="w-full"
                                  disabled={!message.sendToParent && !message.sendToStudent}
                                >
                                  Trimite mesaj
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        {activeRole === "homeroom_teacher" && (
          <Card className="mt-8">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Invitații (diriginte)</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setInvitationRole("student");
                    setInvitationDialogOpen(true);
                  }}
                >
                  Invită elev
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setInvitationRole("parent");
                    setInvitationDialogOpen(true);
                  }}
                >
                  Invită părinte
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!schoolId || !homeroomClassId ? (
                <p className="text-sm text-muted-foreground">
                  Nu pot încărca invitațiile: lipsesc datele de școală/clasă pentru contul tău.
                </p>
              ) : invitesLoading ? (
                <p className="text-sm text-muted-foreground">Se încarcă invitațiile...</p>
              ) : homeroomInvitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu ai invitații create.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rol</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Creat</TableHead>
                      <TableHead>Expiră</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-right">Acțiuni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {homeroomInvitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{getRoleLabelRo(inv.role)}</TableCell>
                        <TableCell>{getStatusLabelRo(getInvitationStatus(inv))}</TableCell>
                        <TableCell>
                          {inv.created_at ? new Date(inv.created_at).toLocaleString("ro-RO") : "-"}
                        </TableCell>
                        <TableCell>
                          {inv.expires_at ? new Date(inv.expires_at).toLocaleString("ro-RO") : "-"}
                        </TableCell>
                        <TableCell>
                          {inv.invited_email || inv.invited_phone ? (
                            <div className="text-xs">
                              {inv.invited_email && <div>{inv.invited_email}</div>}
                              {inv.invited_phone && <div>{inv.invited_phone}</div>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!inv.revoked_at || !!inv.used_at}
                            onClick={async () => {
                              try {
                                await revokeInvitation(inv.id);
                                const invs = await listInvitations({
                                  schoolId,
                                  classId: homeroomClassId,
                                  limit: 50,
                                });
                                setHomeroomInvitations(invs);
                              } catch (e) {
                                console.error("Failed to revoke invitation:", e);
                              }
                            }}
                          >
                            Revocă
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        <CreateInvitationDialog
          open={invitationDialogOpen}
          onOpenChange={setInvitationDialogOpen}
          schoolId={schoolId || ""}
          role={invitationRole}
          classId={invitationRole === "student" || invitationRole === "parent" ? homeroomClassId : undefined}
          studentId={undefined}
          onCreated={async () => {
            if (schoolId && homeroomClassId) {
              const invs = await listInvitations({ schoolId, classId: homeroomClassId, limit: 50 });
              setHomeroomInvitations(invs);
            }
          }}
        />
    </DashboardLayout>
  );
};

export default TeacherDashboard;