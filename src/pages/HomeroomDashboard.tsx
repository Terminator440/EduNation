import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, GraduationCap, Key, CheckCircle, XCircle, Clock, Copy, Plus, TrendingUp, UserPlus, FileCheck, Calendar, School } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface Student {
  id: string;
  student_number: number | null;
  full_name: string | null;
  is_active: boolean;
  user_id: string | null;
  activation_code: string | null;
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
  const [classStats, setClassStats] = useState<ClassStats>({ totalGrades: 0, totalAbsences: 0, averageGrade: 0, motivatedAbsences: 0 });
  const [classInfo, setClassInfo] = useState<{ id: string; name: string; section: string; year: number } | null>(null);
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isMotivateOpen, setIsMotivateOpen] = useState(false);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
  // Stare unificată pentru noul elev
  const [newStudent, setNewStudent] = useState({ fullName: "", studentNumber: "", contactEmail: "", contactPhone: "" });
  const [newClass, setNewClass] = useState({ year: "", section: "", name: "" });
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [selectedAbsences, setSelectedAbsences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, profile, activeRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Utilizator';

  useEffect(() => {
    if (!authLoading && (!user || activeRole !== 'homeroom_teacher')) {
      navigate('/auth');
    }
  }, [user, activeRole, authLoading, navigate]);

  useEffect(() => {
    if (user && activeRole === 'homeroom_teacher') {
      fetchData();
    }
  }, [user, activeRole]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: classData } = await supabase
        .from('classes')
        .select('id, name, section, year')
        .eq('teacher_id', user?.id)
        .maybeSingle();

      if (classData) {
        setClassInfo(classData);

        const { data: studentsData } = await supabase
          .from('students')
          .select('id, student_number, full_name, is_active, user_id')
          .eq('class_id', classData.id)
          .order('student_number', { ascending: true });

        if (studentsData) {
          const enrichedStudents = await Promise.all(
            studentsData.map(async (student) => {
              let activationCode = null;
              let profileData = null;

              const { data: activationData } = await supabase
                .from('student_activations')
                .select('activation_code')
                .eq('student_id', student.id)
                .eq('is_used', false)
                .maybeSingle();

              if (activationData) {
                activationCode = activationData.activation_code;
              }

              if (student.user_id) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('email')
                  .eq('id', student.user_id)
                  .maybeSingle();
                profileData = profile;
              }

              return {
                ...student,
                activation_code: activationCode,
                profile: profileData,
              };
            })
          );

          setStudents(enrichedStudents);
        }

        const { data: allStudentIds } = await supabase
          .from('students')
          .select('id')
          .eq('class_id', classData.id);

        if (allStudentIds && allStudentIds.length > 0) {
          const studentIds = allStudentIds.map(s => s.id);

          const { data: grades } = await supabase
            .from('grades')
            .select('grade')
            .in('student_id', studentIds);

          const { data: attendance } = await supabase
            .from('attendance')
            .select('status')
            .in('student_id', studentIds);

          const totalGrades = grades?.length || 0;
          const avgGrade = grades && grades.length > 0 
            ? grades.reduce((sum, g) => sum + Number(g.grade), 0) / grades.length 
            : 0;
          const totalAbs = attendance?.filter(a => a.status === 'absent').length || 0;
          const motivated = attendance?.filter(a => a.status === 'motivat').length || 0;

          setClassStats({
            totalGrades,
            averageGrade: avgGrade,
            totalAbsences: totalAbs,
            motivatedAbsences: motivated,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudent.fullName.trim()) {
      toast({ title: "Eroare", description: "Completează numele elevului", variant: "destructive" });
      return;
    }

    if (!classInfo) {
      toast({ title: "Eroare", description: "Nu s-a putut identifica clasa", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from('students').insert({
        class_id: classInfo.id,
        full_name: newStudent.fullName.trim(),
        student_number: newStudent.studentNumber ? parseInt(newStudent.studentNumber) : null,
        contact_email: newStudent.contactEmail.trim() ? newStudent.contactEmail.trim().toLowerCase() : null,
        contact_phone: newStudent.contactPhone.trim() ? newStudent.contactPhone.trim().replace(/[^0-9+]/g, '') : null,
        is_active: false,
      });

      if (error) throw error;

      toast({
        title: "Elev adăugat!",
        description: `${newStudent.fullName} a fost adăugat în clasă`,
      });

      setIsAddStudentOpen(false);
      setNewStudent({ fullName: "", studentNumber: "", contactEmail: "", contactPhone: "" });
      fetchData();
    } catch (error) {
      console.error('Error adding student:', error);
      toast({ title: "Eroare", description: "Nu s-a putut adăuga elevul", variant: "destructive" });
    }
  };

  const handleGenerateCode = async (studentId: string) => {
    setGeneratingCode(studentId);
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error } = await supabase.from('student_activations').insert({
        student_id: studentId,
        activation_code: code,
        created_by: user?.id,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      toast({ title: "Cod generat!", description: `Codul de activare: ${code}` });
      fetchData();
    } catch (error) {
      console.error('Error generating code:', error);
      toast({ title: "Eroare", description: "Nu s-a putut genera codul", variant: "destructive" });
    } finally {
      setGeneratingCode(null);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copiat!", description: "Codul a fost copiat în clipboard." });
  };

  const fetchAbsences = async () => {
    if (!classInfo) return;
    try {
      const { data: studentIds } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', classInfo.id);

      if (studentIds && studentIds.length > 0) {
        const ids = studentIds.map(s => s.id);
        const studentMap = Object.fromEntries(studentIds.map(s => [s.id, s.full_name || 'Necunoscut']));

        const { data: absenceData } = await supabase
          .from('attendance')
          .select('id, date, status, student_id, subject_id')
          .in('student_id', ids)
          .eq('status', 'absent')
          .order('date', { ascending: false });

        if (absenceData) {
          const subjectIds = [...new Set(absenceData.map(a => a.subject_id))];
          const { data: subjects } = await supabase
            .from('subjects')
            .select('id, name')
            .in('id', subjectIds);

          const subjectMap = Object.fromEntries((subjects || []).map(s => [s.id, s.name]));

          setAbsences(absenceData.map(a => ({
            id: a.id,
            date: a.date,
            status: a.status,
            student_id: a.student_id,
            student_name: studentMap[a.student_id],
            subject_name: subjectMap[a.subject_id] || 'Necunoscut',
          })));
        }
      }
    } catch (error) {
      console.error('Error fetching absences:', error);
    }
  };

  const handleMotivateAbsences = async () => {
    if (selectedAbsences.length === 0) return;
    try {
      const { error } = await supabase.from('attendance').update({ status: 'motivat' }).in('id', selectedAbsences);
      if (error) throw error;
      toast({ title: "Succes!", description: `${selectedAbsences.length} absențe motivate` });
      setSelectedAbsences([]);
      setIsMotivateOpen(false);
      fetchData();
    } catch (error) {
      toast({ title: "Eroare", description: "Eroare la motivare", variant: "destructive" });
    }
  };

  const handleCreateClass = async () => {
    if (!newClass.year || !newClass.section) return;
    try {
      const className = newClass.name || `Clasa ${newClass.year}${newClass.section}`;
      const { error } = await supabase.from('classes').insert({
        year: parseInt(newClass.year),
        section: newClass.section.toUpperCase(),
        name: className,
        teacher_id: user?.id,
      });
      if (error) throw error;
      setIsCreateClassOpen(false);
      fetchData();
    } catch (error) {
      toast({ title: "Eroare", description: "Nu s-a putut crea clasa", variant: "destructive" });
    }
  };

  const toggleAbsenceSelection = (id: string) => {
    setSelectedAbsences(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
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
        <header className="h-16 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold">
              Clasa Mea - {classInfo ? `${classInfo.year}${classInfo.section}` : 'Fără clasă'}
            </h1>
            <p className="text-sm text-muted-foreground">Diriginte: {displayName}</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
          </div>
        </header>

        <div className="p-8">
          {!classInfo ? (
            <Card className="max-w-lg mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><School /> Creează-ți Clasa</CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setIsCreateClassOpen(true)} className="w-full gap-2"><Plus /> Creează Clasă</Button>
                <Dialog open={isCreateClassOpen} onOpenChange={setIsCreateClassOpen}>
                  <DialogContent>
                    <div className="space-y-4">
                      <Label>Anul</Label>
                      <Input type="number" value={newClass.year} onChange={(e) => setNewClass(p => ({ ...p, year: e.target.value }))} />
                      <Label>Secțiunea</Label>
                      <Input value={newClass.section} onChange={(e) => setNewClass(p => ({ ...p, section: e.target.value }))} />
                      <Button onClick={handleCreateClass} className="w-full">Salvează</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatsCard title="Total Elevi" value={students.length.toString()} icon={Users} variant="primary" />
                <StatsCard title="Media Clasei" value={classStats.averageGrade.toFixed(2)} icon={TrendingUp} variant="accent" />
                <StatsCard title="Absențe" value={classStats.totalAbsences.toString()} subtitle={`${classStats.motivatedAbsences} motivate`} icon={XCircle} variant="warning" />
              </div>

              <div className="flex gap-3 mb-6">
                <Button onClick={() => setIsAddStudentOpen(true)} className="gap-2"><UserPlus /> Adaugă Elev</Button>
                <Button onClick={() => setIsMotivateOpen(true)} variant="outline" className="gap-2"><FileCheck /> Motivează</Button>
              </div>

              <Card>
                <CardHeader><CardTitle>Lista Elevilor</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nr.</TableHead>
                        <TableHead>Nume</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Acțiuni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((s, i) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.student_number || i + 1}</TableCell>
                          <TableCell>{s.full_name}</TableCell>
                          <TableCell>{s.is_active ? "Activ" : "Inactiv"}</TableCell>
                          <TableCell>
                            {!s.is_active && !s.activation_code && (
                              <Button size="sm" onClick={() => handleGenerateCode(s.id)} disabled={generatingCode === s.id}>Cod</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adaugă elev nou</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nume complet</Label>
              <Input value={newStudent.fullName} onChange={e => setNewStudent({...newStudent, fullName: e.target.value})} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newStudent.contactEmail} onChange={e => setNewStudent({...newStudent, contactEmail: e.target.value})} />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={newStudent.contactPhone} onChange={e => setNewStudent({...newStudent, contactPhone: e.target.value})} />
            </div>
            <Button onClick={handleAddStudent} className="w-full">Adaugă</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HomeroomDashboard;