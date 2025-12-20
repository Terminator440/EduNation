import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, GraduationCap, Key, CheckCircle, XCircle, Clock, Copy, Plus, TrendingUp, UserPlus, FileCheck, Calendar } from "lucide-react";
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
  const [newStudent, setNewStudent] = useState({ fullName: "", studentNumber: "" });
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
      // Fetch teacher's class
      const { data: classData } = await supabase
        .from('classes')
        .select('id, name, section, year')
        .eq('teacher_id', user?.id)
        .maybeSingle();

      if (classData) {
        setClassInfo(classData);

        // Fetch students with their activation codes
        const { data: studentsData } = await supabase
          .from('students')
          .select('id, student_number, full_name, is_active, user_id')
          .eq('class_id', classData.id)
          .order('student_number', { ascending: true });

        if (studentsData) {
          // Fetch activation codes for inactive students
          const enrichedStudents = await Promise.all(
            studentsData.map(async (student) => {
              let activationCode = null;
              let profileData = null;

              // Get activation code if exists
              const { data: activationData } = await supabase
                .from('student_activations')
                .select('activation_code')
                .eq('student_id', student.id)
                .eq('is_used', false)
                .maybeSingle();

              if (activationData) {
                activationCode = activationData.activation_code;
              }

              // Get profile if user_id exists
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

        // Fetch class statistics
        const { data: allStudentIds } = await supabase
          .from('students')
          .select('id')
          .eq('class_id', classData.id);

        if (allStudentIds && allStudentIds.length > 0) {
          const studentIds = allStudentIds.map(s => s.id);

          // Get all grades
          const { data: grades } = await supabase
            .from('grades')
            .select('grade')
            .in('student_id', studentIds);

          // Get all attendance
          const { data: attendance } = await supabase
            .from('attendance')
            .select('status')
            .in('student_id', studentIds);

          const totalGrades = grades?.length || 0;
          const avgGrade = grades && grades.length > 0 
            ? grades.reduce((sum, g) => sum + Number(g.grade), 0) / grades.length 
            : 0;
          const absences = attendance?.filter(a => a.status === 'absent').length || 0;
          const motivated = attendance?.filter(a => a.status === 'motivat').length || 0;

          setClassStats({
            totalGrades,
            averageGrade: avgGrade,
            totalAbsences: absences,
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

  const handleGenerateCode = async (studentId: string) => {
    setGeneratingCode(studentId);
    try {
      // Generate a random activation code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // Expires in 30 days

      const { error } = await supabase.from('student_activations').insert({
        student_id: studentId,
        activation_code: code,
        created_by: user?.id,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      toast({
        title: "Cod generat!",
        description: `Codul de activare: ${code}`,
      });

      fetchData();
    } catch (error) {
      console.error('Error generating code:', error);
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
    navigator.clipboard.writeText(code);
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
      const { error } = await supabase.from('students').insert({
        class_id: classInfo.id,
        full_name: newStudent.fullName.trim(),
        student_number: newStudent.studentNumber ? parseInt(newStudent.studentNumber) : null,
        is_active: false,
      });

      if (error) throw error;

      toast({
        title: "Elev adăugat!",
        description: `${newStudent.fullName} a fost adăugat în clasă`,
      });

      setIsAddStudentOpen(false);
      setNewStudent({ fullName: "", studentNumber: "" });
      fetchData();
    } catch (error) {
      console.error('Error adding student:', error);
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
          // Get subject names
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
    if (selectedAbsences.length === 0) {
      toast({
        title: "Eroare",
        description: "Selectează cel puțin o absență",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('attendance')
        .update({ status: 'motivat' })
        .in('id', selectedAbsences);

      if (error) throw error;

      toast({
        title: "Succes!",
        description: `${selectedAbsences.length} absențe au fost motivate`,
      });

      setSelectedAbsences([]);
      setIsMotivateOpen(false);
      fetchData();
      fetchAbsences();
    } catch (error) {
      console.error('Error motivating absences:', error);
      toast({
        title: "Eroare",
        description: "Nu s-au putut motiva absențele",
        variant: "destructive",
      });
    }
  };

  const toggleAbsenceSelection = (id: string) => {
    setSelectedAbsences(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const activeStudents = students.filter(s => s.is_active).length;
  const pendingActivation = students.filter(s => !s.is_active && s.activation_code).length;
  const notActivated = students.filter(s => !s.is_active && !s.activation_code).length;

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
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Clasa Mea - {classInfo ? `${classInfo.year}${classInfo.section}` : 'Se încarcă...'}
            </h1>
            <p className="text-sm text-muted-foreground">Diriginte: {displayName}</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
              {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Total Elevi"
              value={students.length.toString()}
              subtitle={classInfo ? `Clasa ${classInfo.year}${classInfo.section}` : ''}
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

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
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
                      onChange={(e) => setNewStudent(p => ({ ...p, fullName: e.target.value }))}
                      placeholder="ex: Popescu Ion Alexandru"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Număr matricol (opțional)</Label>
                    <Input
                      type="number"
                      value={newStudent.studentNumber}
                      onChange={(e) => setNewStudent(p => ({ ...p, studentNumber: e.target.value }))}
                      placeholder="ex: 1"
                      className="mt-1"
                    />
                  </div>
                  <Button onClick={handleAddStudent} className="w-full">
                    Adaugă elev
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isMotivateOpen} onOpenChange={(open) => {
              setIsMotivateOpen(open);
              if (open) {
                fetchAbsences();
                setSelectedAbsences([]);
              }
            }}>
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
                                {absence.subject_name} • {new Date(absence.date).toLocaleDateString('ro-RO')}
                              </p>
                            </div>
                          </div>
                        ))}
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

          {/* Students Table */}
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
                  <p className="text-sm mt-2">Folosește butonul "Adaugă Elev" pentru a adăuga elevi.</p>
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
                        <TableCell className="font-medium">{student.student_number || index + 1}</TableCell>
                        <TableCell className="font-medium">{student.full_name || 'Nespecificat'}</TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                            student.is_active 
                              ? "bg-success/10 text-success" 
                              : student.activation_code
                              ? "bg-warning/10 text-warning"
                              : "bg-muted text-muted-foreground"
                          )}>
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
                              onClick={() => handleGenerateCode(student.id)}
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
        </div>
      </main>
    </div>
  );
};

export default HomeroomDashboard;
