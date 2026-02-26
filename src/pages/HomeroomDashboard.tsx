import { useState, useEffect, useCallback } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import {
  addStudent,
  createClass,
  fetchAbsencesForClass,
  fetchStudentNumbersForClass,
  checkStudentNumberInUse,
  motivateAbsences,
  fetchHomeroomDashboardData,
  generateStudentActivationCode,
} from "@/features/homeroom/services/homeroom.service";
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
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";
import { CreateInvitationDialog } from "@/components/invitations/CreateInvitationDialog";
import { listInvitations, type InvitationRole, type Invitation } from "@/lib/invitations";
import {
  formatStudentNumber,
  hasStudentNumberInput,
  getNextStudentNumber,
  parseStudentNumberNumeric,
} from "@/lib/studentNumber";
import { validateCNP, parseCNP, formatBirthDateRO } from "@/lib/cnp";

interface Student {
  id: string;
  student_number: string | number | null;
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
  const onToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);
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
    cnp: "",
    birthDate: null as Date | null,
    gender: null as "M" | "F" | null,
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
  // Note: homeroomInvitations and homeroomInvLoading are kept for future use
  const [_homeroomInvitations, _setHomeroomInvitations] = useState<Invitation[]>([]);
  const [_homeroomInvLoading, _setHomeroomInvLoading] = useState(false);

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
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId || !user?.id) {
        setLoading(false);
        return;
      }

      const data = await fetchHomeroomDashboardData(schoolId, user.id);
      if (!data) return;

      setClassInfo(data.classInfo);
      setStudents(data.students);
      setClassStats(data.classStats);
      setAlerts(data.alerts);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCode = async (studentId: string) => {
    if (!user?.id) return;
    setGeneratingCode(studentId);
    try {
      const code = await generateStudentActivationCode(studentId, user.id);

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
      let finalNumberDisplay: string;
      let finalNumberNumeric: number;

      if (hasStudentNumberInput(newStudent.studentNumber)) {
        finalNumberDisplay = formatStudentNumber(newStudent.studentNumber);
        const parsed = parseStudentNumberNumeric(finalNumberDisplay);
        if (parsed == null) {
          toast({
            title: "Eroare",
            description: "Numărul matricol nu este valid. Exemplu: EN-00001 sau 1.",
            variant: "destructive",
          });
          return;
        }
        finalNumberNumeric = parsed;
      } else {
        const existing = await fetchStudentNumbersForClass(classInfo.id);
        finalNumberDisplay = getNextStudentNumber(existing);

        const parsed = parseStudentNumberNumeric(finalNumberDisplay);
        if (parsed == null) {
          toast({
            title: "Eroare",
            description: "Nu am putut genera un număr matricol valid.",
            variant: "destructive",
          });
          return;
        }
        finalNumberNumeric = parsed;
      }

      const inUse = await checkStudentNumberInUse(classInfo.id, finalNumberNumeric);
      if (inUse) {
        toast({
          title: "Eroare",
          description: `Acest număr matricol (${finalNumberDisplay}) este deja atribuit.`,
          variant: "destructive",
        });
        return;
      }

      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId) throw new Error("Nu aveți o școală asociată");

      const payload = {
        class_id: classInfo.id,
        school_id: schoolId,
        full_name: newStudent.fullName.trim(),
        student_number: finalNumberNumeric,
        is_active: false,
        cnp: undefined as string | null | undefined,
        birth_date: undefined as string | null | undefined,
        gender: undefined as string | null | undefined,
      };
      if (newStudent.cnp.trim() && validateCNP(newStudent.cnp.trim())) {
        const parsed = parseCNP(newStudent.cnp.trim());
        if (parsed) {
          payload.cnp = parsed.cnp;
          payload.birth_date = parsed.birthDate.toISOString().slice(0, 10);
          payload.gender = parsed.gender;
        }
      }

      await addStudent(payload);

      toast({
        title: "Elev adăugat!",
        description: `${newStudent.fullName} a fost adăugat în clasă (${finalNumberDisplay}).`,
      });

      setIsAddStudentOpen(false);
      setNewStudent({ fullName: "", studentNumber: "", email: "", phone: "", cnp: "", birthDate: null, gender: null });
      await fetchData();
    } catch (err: unknown) {
      const message = toFriendlySupabaseError(err, { entity: "student", action: "add" });
      toast({
        title: "Eroare",
        description: message,
        variant: "destructive",
      });
    }
  };

  const fetchAbsences = async () => {
    if (!classInfo) return;
    try {
      const sid = await getCurrentUserSchoolId();
      if (!sid) return;
      const data = await fetchAbsencesForClass(classInfo.id, sid);
      setAbsences(data);
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
      await motivateAbsences(
        selectedAbsences,
        motivateReason.trim() ? motivateReason.trim() : null
      );

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
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId || !user?.id) throw new Error("Nu aveți o școală asociată");

      const className = newClass.name || `Clasa ${newClass.year}${newClass.section}`;
      await createClass({
        year: parseInt(newClass.year, 10),
        section: newClass.section.toUpperCase(),
        name: className,
        teacher_id: user.id,
        school_id: schoolId,
      });

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
  // Note: pendingActivation and notActivated are kept for future use
  const _pendingActivation = students.filter((s) => !s.is_active && s.activation_code).length;
  const _notActivated = students.filter((s) => !s.is_active && !s.activation_code).length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="md" className="text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={onToggleSidebar}
      />

      <main
        className={cn(
          "w-full min-w-0 transition-all duration-300 will-change-transform",
          "pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64"
        )}
      >
        <header className="w-full h-16 border-b border-border bg-card flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
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

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
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
                  value={
                    classStats.averageGrade > 0 ? (
                      <span className={cn(
                        "font-semibold",
                        classStats.averageGrade < 5 ? "text-destructive" :
                        classStats.averageGrade >= 9 ? "text-success" :
                        classStats.averageGrade >= 7 ? "text-primary" :
                        "text-warning"
                      )}>
                        {classStats.averageGrade.toFixed(2)}
                      </span>
                    ) : "—"
                  }
                  subtitle={classStats.averageGrade > 0 ? `Din ${classStats.totalGrades ?? 0} note` : "Fără note"}
                  icon={TrendingUp}
                  variant="accent"
                  showIcon={classStats.averageGrade > 0}
                />
                <StatsCard
                  title="Absențe"
                  value={(classStats.totalAbsences ?? 0).toString()}
                  subtitle={`${classStats.motivatedAbsences ?? 0} motivate`}
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

              <div className="flex flex-wrap gap-3 mb-6 items-center">
                <Button
                  className="gap-2 h-10 px-4"
                  onClick={() => { setInvRole("teacher"); setInvDialogOpen(true); }}
                >
                  <GraduationCap className="h-4 w-4" />
                  Adaugă Profesor
                </Button>
                <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2 h-10 px-4">
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
                        <Label>CNP (opțional – completează data nașterii și genul automat)</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          maxLength={13}
                          value={newStudent.cnp}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 13);
                            setNewStudent((p) => {
                              const next = { ...p, cnp: v, birthDate: null as Date | null, gender: null as "M" | "F" | null };
                              if (v.length === 13) {
                                const parsed = parseCNP(v);
                                if (parsed) {
                                  next.birthDate = parsed.birthDate;
                                  next.gender = parsed.gender;
                                }
                              }
                              return next;
                            });
                          }}
                          onBlur={() => {
                            const v = newStudent.cnp.trim();
                            if (v.length === 13 && !newStudent.birthDate) {
                              const parsed = parseCNP(v);
                              if (parsed)
                                setNewStudent((p) => ({ ...p, birthDate: parsed.birthDate, gender: parsed.gender }));
                            }
                          }}
                          placeholder="13 cifre"
                          className="mt-1 font-mono"
                        />
                        {newStudent.cnp.length > 0 && newStudent.cnp.length !== 13 && (
                          <p className="text-xs text-muted-foreground mt-1">CNP-ul are 13 cifre</p>
                        )}
                        {newStudent.cnp.length === 13 && !newStudent.birthDate && (
                          <p className="text-xs text-destructive mt-1">CNP invalid (verifică cifra de control)</p>
                        )}
                        {newStudent.birthDate && (
                          <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                            <span>Data nașterii: <strong className="text-foreground">{formatBirthDateRO(newStudent.birthDate)}</strong></span>
                            <span>Gen: <strong className="text-foreground">{newStudent.gender === "M" ? "Bărbat" : "Femeie"}</strong></span>
                          </div>
                        )}
                      </div>
                      <div>
                        <Label>Număr Matricol (lasă gol pentru generare automată)</Label>
                        <Input
                          type="text"
                          value={newStudent.studentNumber}
                          onChange={(e) =>
                            setNewStudent((p) => ({ ...p, studentNumber: e.target.value }))
                          }
                          placeholder="Ex: 450 (va deveni EN-00450)"
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
                <Button
                  variant="outline"
                  className="gap-2 h-10 px-4"
                  onClick={() => { setInvRole("parent"); setInvDialogOpen(true); }}
                >
                  <Mail className="h-4 w-4" />
                  Invită Părinte
                </Button>
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
                    <Button variant="outline" className="gap-2 h-10 px-4">
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
                      <p>Nu există elevi înregistrați încă în această clasă.</p>
                      <p className="text-sm mt-2">
                        Folosește butonul Adaugă Elev pentru a începe.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-full">Nr.</TableHead>
                          <TableHead>Nume</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Cod Activare</TableHead>
                          <TableHead className="w-full">Acțiuni</TableHead>
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
                    </div>
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
