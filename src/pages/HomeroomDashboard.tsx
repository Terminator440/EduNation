import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  GraduationCap,
  Key,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Plus,
  TrendingUp,
  UserPlus,
  FileCheck,
  Calendar,
  School,
  Mail,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "@/hooks/use-toast";
import { CreateInvitationDialog } from "@/components/invitations/CreateInvitationDialog";
import { listInvitations, getInvitationStatus, getStatusLabelRo, getRoleLabelRo, type InvitationRole, type Invitation } from "@/lib/invitations";

interface Student {
  id: string;
  student_number: number | null;
  full_name: string | null;
  is_active: boolean;
  user_id: string | null;
  activation_code?: string | null;
  profile?: {
    email: string;
  } | null;
}

interface ClassStats {
  totalGrades: number;
  totalAbsences: number;
  averageGrade: number;
  motivatedAbsences: number;
}

interface Absence {
  id: string;
  date: string;
  status: string;
  student_id: string;
  student_name: string;
  subject_name: string;
}

const HomeroomDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [classStats, setClassStats] = useState<ClassStats>({
    totalGrades: 0,
    totalAbsences: 0,
    averageGrade: 0,
    motivatedAbsences: 0,
  });
  const [classInfo, setClassInfo] = useState<{
    id: string;
    name: string;
    section: string;
    year: number;
    school_id: string | null;
  } | null>(null);
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isMotivateOpen, setIsMotivateOpen] = useState(false);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({
    fullName: "",
    studentNumber: "",
    email: "",
    phone: "",
  });
  const [newClass, setNewClass] = useState({ year: "", section: "", name: "" });
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [selectedAbsences, setSelectedAbsences] = useState<string[]>([]);
  const [motivateReason, setMotivateReason] = useState<string>("");
  const [alerts, setAlerts] = useState<{
    manyAbsences: Student[];
    noGrades: Student[];
  }>({ manyAbsences: [], noGrades: [] });
  const [loading, setLoading] = useState(true);

  // Invitation state
  const [invDialogOpen, setInvDialogOpen] = useState(false);
  const [invRole, setInvRole] = useState<InvitationRole>("student");
  const [homeroomInvitations, setHomeroomInvitations] = useState<Invitation[]>([]);
  const [homeroomInvLoading, setHomeroomInvLoading] = useState(false);

  const { user, profile, activeRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const displayName =
    profile?.full_name || user?.email?.split("@")[0] || "Utilizator";

  useEffect(() => {
    if (!authLoading && (!user || activeRole !== "homeroom_teacher")) {
      navigate("/auth");
    }
  }, [user, activeRole, authLoading, navigate]);

  useEffect(() => {
    if (user && activeRole === "homeroom_teacher") {
      void fetchData();
      void fetchHomeroomInvitations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeRole]);

  const fetchHomeroomInvitations = async () => {
    if (!user) return;
    setHomeroomInvLoading(true);
    try {
      const invs = await listInvitations({ createdByUserId: user.id, limit: 50 });
      setHomeroomInvitations(invs as Invitation[]);
    } catch (e) {
      console.error("Failed to load homeroom invitations:", e);
    } finally {
      setHomeroomInvLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: classData } = await supabase
        .from("classes")
        .select("id, name, section, year, school_id")
        .eq("teacher_id", user?.id)
        .maybeSingle();

      if (!classData) return;

      setClassInfo(classData);

      const { data: studentsData } = await supabase
        .from("students")
        .select("id, student_number, full_name, is_active, user_id")
        .eq("class_id", classData.id)
        .order("student_number", { ascending: true });

      if (studentsData) {
        const enrichedStudents = await Promise.all(
          studentsData.map(async (student) => {
            let activationCode: string | null = null;
            let profileData: { email: string } | null = null;

            const { data: activationData } = await supabase
              .from("student_activations")
              .select("activation_code")
              .eq("student_id", student.id)
              .eq("is_used", false)
              .maybeSingle();

            if (activationData) {
              activationCode = activationData.activation_code;
            }

            if (student.user_id) {
              const { data: prof } = await supabase
                .from("profiles")
                .select("email")
                .eq("id", student.user_id)
                .maybeSingle();

              profileData = prof ?? null;
            }

            return {
              ...student,
              activation_code: activationCode,
              profile: profileData,
            } satisfies Student;
          })
        );

        setStudents(enrichedStudents);
      }

      const { data: allStudentIds } = await supabase
        .from("students")
        .select("id")
        .eq("class_id", classData.id);

      if (!allStudentIds || allStudentIds.length === 0) return;

      const studentIds = allStudentIds.map((s) => s.id);

      const { data: grades } = await supabase
        .from("grades")
        .select("grade, student_id")
        .in("student_id", studentIds);

      const { data: attendance } = await supabase
        .from("attendance")
        .select("status, student_id")
        .in("student_id", studentIds);

      const totalGrades = grades?.length || 0;

      const avgGrade =
        grades && grades.length > 0
          ? grades.reduce((sum, g) => sum + Number(g.grade), 0) / grades.length
          : 0;

      const absencesCount =
        attendance?.filter((a) => ["unexcused", "pending"].includes(a.status)).length || 0;

      const motivated =
        attendance?.filter((a) => a.status === "motivated").length || 0;

      setClassStats({
        totalGrades,
        averageGrade: avgGrade,
        totalAbsences: absencesCount,
        motivatedAbsences: motivated,
      });

      const absByStudent = new Map<string, number>();
      (attendance || []).forEach((a: any) => {
        if (!["unexcused", "pending"].includes(a.status)) return;
        absByStudent.set(
          a.student_id,
          (absByStudent.get(a.student_id) || 0) + 1
        );
      });

      const gradesByStudent = new Map<string, number>();
      (grades || []).forEach((g: any) => {
        gradesByStudent.set(g.student_id, (gradesByStudent.get(g.student_id) || 0) + 1);
      });

      const threshold = 10;

      const manyAbsences: Student[] = (studentsData || [])
        .filter((s: any) => (absByStudent.get(s.id) || 0) >= threshold)
        .sort(
          (a: any, b: any) =>
            (absByStudent.get(b.id) || 0) - (absByStudent.get(a.id) || 0)
        )
        .map((s: any) => ({ ...s, activation_code: null }));

      const noGrades: Student[] = (studentsData || [])
        .filter((s: any) => (gradesByStudent.get(s.id) || 0) === 0)
        .sort(
          (a: any, b: any) =>
            (a.student_number ?? 9999) - (b.student_number ?? 9999)
        )
        .map((s: any) => ({ ...s, activation_code: null }));

      setAlerts({ manyAbsences, noGrades });
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCode = async (studentId: string) => {
    setGeneratingCode(studentId);
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error: insertError } = await supabase
        .from("student_activations")
        .insert({
          student_id: studentId,
          activation_code: code,
          created_by: user?.id,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) throw insertError;

      toast({
        title: "Cod generat!",
        description: `Codul de activare: ${code}`,
      });

      await fetchData();
    } catch (err) {
      console.error("Error generating code:", err);
      toast({
        title: "Eroare",
        description: "Nu s-a putut genera codul de activare",
        variant: "destructive",
      });
    } finally {
      setGeneratingCode(null);
    }
  };

  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    toast({
      title: "Copiat!",
      description: "Codul a fost copiat în clipboard.",
    });
  };

  const handleAddStudent = async () => {
    if (!newStudent.fullName.trim()) {
      toast({
        title: "Eroare",
        description: "Completează numele elevului",
        variant: "destructive",
      });
      return;
    }

    if (!classInfo) {
      toast({
        title: "Eroare",
        description: "Nu s-a putut identifica clasa",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error: insertError } = await supabase.from("students").insert({
        class_id: classInfo.id,
        full_name: newStudent.fullName.trim(),
        student_number: newStudent.studentNumber
          ? parseInt(newStudent.studentNumber, 10)
          : null,
        contact_email: newStudent.email.trim()
          ? newStudent.email.trim().toLowerCase()
          : null,
        contact_phone: newStudent.phone.trim() ? newStudent.phone.trim() : null,
        is_active: false,
      });

      if (insertError) throw insertError;

      toast({
        title: "Elev adăugat!",
        description: `${newStudent.fullName} a fost adăugat în clasă`,
      });

      setIsAddStudentOpen(false);
      setNewStudent({ fullName: "", studentNumber: "", email: "", phone: "" });
      await fetchData();
    } catch (err) {
      console.error("Error adding student:", err);
      toast({
        title: "Eroare",
        description: "Nu s-a putut adăuga elevul",
        variant: "destructive",
      });
    }
  };

  const fetchAbsences = async () => {
    if (!classInfo) return;

    try {
      const { data: studentIds } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("class_id", classInfo.id);

      if (!studentIds || studentIds.length === 0) return;

      const ids = studentIds.map((s) => s.id);
      const studentMap = Object.fromEntries(
        studentIds.map((s) => [s.id, s.full_name || "Necunoscut"])
      );

      const { data: absenceData } = await supabase
        .from("attendance")
        .select("id, date, status, student_id, subject_id")
        .in("student_id", ids)
        .in("status", ["unexcused", "pending"])
        .order("date", { ascending: false });

      if (!absenceData) return;

      const subjectIds = [...new Set(absenceData.map((a: any) => a.subject_id))];
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, name")
        .in("id", subjectIds);

      const subjectMap = Object.fromEntries((subjects || []).map((s) => [s.id, s.name]));

      setAbsences(
        absenceData.map((a: any) => ({
          id: a.id,
          date: a.date,
          status: a.status,
          student_id: a.student_id,
          student_name: studentMap[a.student_id],
          subject_name: subjectMap[a.subject_id] || "Necunoscut",
        }))
      );
    } catch (err) {
      console.error("Error fetching absences:", err);
    }
  };

  const handleMotivateAbsences = async () => {
    if (selectedAbsences.length === 0) {
      toast({
        title: "Eroare",
        description: "Selectează cel puțin o absență",
        variant: "destructive",
      });
      return;
    }

    try {
      const updatePayload: any = {
        status: "motivated",
        excuse_reason: motivateReason.trim() ? motivateReason.trim() : null,
        excused_at: new Date().toISOString(),
      };

      const { error: updateError } = await (supabase as any)
        .from("attendance")
        .update(updatePayload)
        .in("id", selectedAbsences as any);

      if (updateError) {
        const { error: fallbackError } = await supabase
          .from("attendance")
          .update({ status: "motivated" })
          .in("id", selectedAbsences as any);

        if (fallbackError) throw fallbackError;
      }

      toast({
        title: "Succes!",
        description: `${selectedAbsences.length} absențe au fost motivate`,
      });

      setSelectedAbsences([]);
      setIsMotivateOpen(false);
      setMotivateReason("");
      await fetchData();
      await fetchAbsences();
    } catch (err) {
      console.error("Error motivating absences:", err);
      toast({
        title: "Eroare",
        description: "Nu s-au putut motiva absențele",
        variant: "destructive",
      });
    }
  };

  const handleCreateClass = async () => {
    if (!newClass.year || !newClass.section) {
      toast({
        title: "Eroare",
        description: "Completează anul și secțiunea clasei",
        variant: "destructive",
      });
      return;
    }

    try {
      const className = newClass.name || `Clasa ${newClass.year}${newClass.section}`;
      const { error: insertError } = await supabase.from("classes").insert({
        year: parseInt(newClass.year, 10),
        section: newClass.section.toUpperCase(),
        name: className,
        teacher_id: user?.id,
      });

      if (insertError) throw insertError;

      toast({
        title: "Clasă creată!",
        description: `Clasa ${newClass.year}${newClass.section} a fost creată cu succes`,
      });

      setIsCreateClassOpen(false);
      setNewClass({ year: "", section: "", name: "" });
      await fetchData();
    } catch (err) {
      console.error("Error creating class:", err);
      toast({
        title: "Eroare",
        description: "Nu s-a putut crea clasa",
        variant: "destructive",
      });
    }
  };

  const toggleAbsenceSelection = (id: string) => {
    setSelectedAbsences((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const activeStudents = students.filter((s) => s.is_active).length;
  const pendingActivation = students.filter((s) => !s.is_active && s.activation_code).length;
  const notActivated = students.filter((s) => !s.is_active && !s.activation_code).length;

  // (pendingActivation/notActivated sunt calculate dar nefolosite – dacă ESLint ai "no-unused-vars",
  // fie le afișezi undeva, fie le scoți. Le-am lăsat ca la tine.)

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "ml-20" : "ml-64"
        )}
      >
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Clasa Mea - {classInfo ? `${classInfo.year}${classInfo.section}` : "Se încarcă..."}
            </h1>
            <p className="text-sm text-muted-foreground">Diriginte: {displayName}</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
              {displayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          </div>
        </header>

        <div className="p-8">
          {!classInfo ? (
            <Card className="max-w-lg mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <School className="h-5 w-5" />
                  Creează-ți Clasa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-6">
                  Nu ai nicio clasă asociată. Creează-ți clasa pentru a putea adăuga elevi.
                </p>
                <Dialog open={isCreateClassOpen} onOpenChange={setIsCreateClassOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full gap-2">
                      <Plus className="h-4 w-4" />
                      Creează Clasă
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Creează o clasă nouă</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <Label>Anul (ex: 9, 10, 11, 12)</Label>
                        <Input
                          type="number"
                          value={newClass.year}
                          onChange={(e) =>
                            setNewClass((p) => ({ ...p, year: e.target.value }))
                          }
                          placeholder="ex: 9"
                          className="mt-1"
                          min="1"
                          max="12"
                        />
                      </div>
                      <div>
                        <Label>Secțiunea (ex: A, B, C)</Label>
                        <Input
                          value={newClass.section}
                          onChange={(e) =>
                            setNewClass((p) => ({ ...p, section: e.target.value }))
                          }
                          placeholder="ex: A"
                          className="mt-1"
                          maxLength={2}
                        />
                      </div>
                      <div>
                        <Label>Nume clasă (opțional)</Label>
                        <Input
                          value={newClass.name}
                          onChange={(e) =>
                            setNewClass((p) => ({ ...p, name: e.target.value }))
                          }
                          placeholder="ex: Matematică-Informatică"
                          className="mt-1"
                        />
                      </div>
                      <Button onClick={handleCreateClass} className="w-full">
                        Creează clasă
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatsCard
                  title="Total Elevi"
                  value={students.length.toString()}
                  subtitle={classInfo ? `Clasa ${classInfo.year}${classInfo.section}` : ""}
                  icon={Users}
                  variant="primary"
                />
                <StatsCard
                  title="Conturi Active"
                  value={activeStudents.toString()}
                  subtitle="Activați"
                  icon={CheckCircle}
                  variant="success"
                />
                <StatsCard
                  title="Media Clasei"
                  value={classStats.averageGrade > 0 ? classStats.averageGrade.toFixed(2) : "-"}
                  subtitle={`Din ${classStats.totalGrades} note`}
                  icon={TrendingUp}
                  variant="accent"
                />
                <StatsCard
                  title="Absențe"
                  value={classStats.totalAbsences.toString()}
                  subtitle={`${classStats.motivatedAbsences} motivate`}
                  icon={XCircle}
                  variant="warning"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      Elevi cu absențe multe
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {alerts.manyAbsences.length === 0 ? (
                      <p className="text-muted-foreground">—</p>
                    ) : (
                      <ul className="space-y-2">
                        {alerts.manyAbsences.slice(0, 8).map((s) => (
                          <li key={s.id} className="flex items-center justify-between gap-3">
                            <span>{s.full_name ?? "(fără nume)"}</span>
                            <span className="text-muted-foreground">≥ 10</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-muted-foreground mt-3">
                      Prag: ≥ 10 absențe (total).
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GraduationCap className="h-5 w-5" />
                      Elevi fără note
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {alerts.noGrades.length === 0 ? (
                      <p className="text-muted-foreground">—</p>
                    ) : (
                      <ul className="space-y-2">
                        {alerts.noGrades.slice(0, 8).map((s) => (
                          <li key={s.id} className="flex items-center justify-between gap-3">
                            <span>{s.full_name ?? "(fără nume)"}</span>
                            <span className="text-muted-foreground">0 note</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-muted-foreground mt-3">
                      Definiție: 0 note (total).
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-wrap gap-3 mb-6">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => { setInvRole("teacher"); setInvDialogOpen(true); }}
                >
                  <Mail className="h-4 w-4" />
                  Invită Profesor
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => { setInvRole("parent"); setInvDialogOpen(true); }}
                >
                  <Mail className="h-4 w-4" />
                  Invită Părinte
                </Button>
                <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <UserPlus className="h-4 w-4" />
                      Adaugă Elev
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adaugă elev nou în clasă</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <Label>Nume complet</Label>
                        <Input
                          value={newStudent.fullName}
                          onChange={(e) =>
                            setNewStudent((p) => ({ ...p, fullName: e.target.value }))
                          }
                          placeholder="ex: Popescu Ion Alexandru"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Număr matricol (opțional)</Label>
                        <Input
                          type="number"
                          value={newStudent.studentNumber}
                          onChange={(e) =>
                            setNewStudent((p) => ({ ...p, studentNumber: e.target.value }))
                          }
                          placeholder="ex: 1"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Email elev (opțional)</Label>
                        <Input
                          type="email"
                          value={newStudent.email}
                          onChange={(e) =>
                            setNewStudent((p) => ({ ...p, email: e.target.value }))
                          }
                          placeholder="ex: elev@exemplu.ro"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Telefon elev (opțional)</Label>
                        <Input
                          value={newStudent.phone}
                          onChange={(e) =>
                            setNewStudent((p) => ({ ...p, phone: e.target.value }))
                          }
                          placeholder="ex: +40 7xx xxx xxx"
                          className="mt-1"
                        />
                      </div>
                      <Button onClick={handleAddStudent} className="w-full">
                        Adaugă elev
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={isMotivateOpen}
                  onOpenChange={(open) => {
                    setIsMotivateOpen(open);
                    if (open) {
                      void fetchAbsences();
                      setSelectedAbsences([]);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <FileCheck className="h-4 w-4" />
                      Motivează Absențe
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Motivează Absențe</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      {absences.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Nu sunt absențe nemotivate.</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Selectează absențele pe care dorești să le motivezi:
                          </p>
                          <div className="space-y-2">
                            {absences.map((absence) => (
                              <div
                                key={absence.id}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                  selectedAbsences.includes(absence.id)
                                    ? "bg-primary/10 border-primary"
                                    : "hover:bg-muted"
                                )}
                                onClick={() => toggleAbsenceSelection(absence.id)}
                              >
                                <Checkbox
                                  checked={selectedAbsences.includes(absence.id)}
                                  onCheckedChange={() => toggleAbsenceSelection(absence.id)}
                                />
                                <div className="flex-1">
                                  <p className="font-medium">{absence.student_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {absence.subject_name} •{" "}
                                    {new Date(absence.date).toLocaleDateString("ro-RO")}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div>
                            <Label>Motiv (opțional)</Label>
                            <Textarea
                              value={motivateReason}
                              onChange={(e) => setMotivateReason(e.target.value)}
                              placeholder="ex: Adeverință medicală / motivare părinte..."
                              className="mt-1"
                            />
                          </div>
                          <Button
                            onClick={handleMotivateAbsences}
                            className="w-full"
                            disabled={selectedAbsences.length === 0}
                          >
                            Motivează {selectedAbsences.length} absențe
                          </Button>
                        </>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Lista Elevilor
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {students.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Nu ai elevi în clasă încă.</p>
                      <p className="text-sm mt-2">
                        Folosește butonul "Adaugă Elev" pentru a adăuga elevi.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Nr.</TableHead>
                          <TableHead>Nume</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Cod Activare</TableHead>
                          <TableHead className="w-40">Acțiuni</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((student, index) => (
                          <TableRow key={student.id}>
                            <TableCell className="font-medium">
                              {student.student_number || index + 1}
                            </TableCell>
                            <TableCell className="font-medium">
                              {student.full_name || "Nespecificat"}
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                                  student.is_active
                                    ? "bg-success/10 text-success"
                                    : student.activation_code
                                    ? "bg-warning/10 text-warning"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {student.is_active ? (
                                  <>
                                    <CheckCircle className="h-3 w-3" />
                                    Activ
                                  </>
                                ) : student.activation_code ? (
                                  <>
                                    <Clock className="h-3 w-3" />
                                    Așteaptă
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3" />
                                    Inactiv
                                  </>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {student.profile?.email || "-"}
                            </TableCell>
                            <TableCell>
                              {student.activation_code ? (
                                <div className="flex items-center gap-2">
                                  <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                                    {student.activation_code}
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleCopyCode(student.activation_code!)}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {!student.is_active && !student.activation_code && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                  onClick={() => void handleGenerateCode(student.id)}
                                  disabled={generatingCode === student.id}
                                >
                                  <Key className="h-4 w-4" />
                                  {generatingCode === student.id ? "Se generează..." : "Generează Cod"}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <CreateInvitationDialog
          open={invDialogOpen}
          onOpenChange={setInvDialogOpen}
          schoolId={classInfo?.school_id || ""}
          classId={classInfo?.id}
          role={invRole}
          onCreated={() => void fetchHomeroomInvitations()}
        />
      </main>
    </div>
  );
};

export default HomeroomDashboard;
