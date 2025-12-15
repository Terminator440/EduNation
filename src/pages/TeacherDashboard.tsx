import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, GraduationCap, UserCircle, TrendingUp, Plus, Search, MessageSquare, CheckCircle } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import StatsCard from "@/components/dashboard/StatsCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
  user_id: string;
  student_number: number | null;
  full_name: string | null;
  profile: {
    full_name: string;
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

const TeacherDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const [newAttendance, setNewAttendance] = useState({ status: "prezent", subjectId: "" });
  const [message, setMessage] = useState({ subject: "", content: "", sendToParent: true, sendToStudent: false });
  const [selectedAbsences, setSelectedAbsences] = useState<string[]>([]);

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
    }
  }, [user, activeRole]);

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
          const enrichedStudents = await Promise.all(
            studentsData.map(async (student: any) => {
              let profileData = null;
              if (student.user_id) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('full_name, email')
                  .eq('id', student.user_id)
                  .maybeSingle();
                profileData = profile;
              }

              const { data: gradesData } = await supabase
                .from('grades')
                .select(`
                  id,
                  grade,
                  date,
                  subjects!grades_subject_id_fkey (
                    name
                  )
                `)
                .eq('student_id', student.id);

              const { data: attendanceData } = await supabase
                .from('attendance')
                .select(`
                  id,
                  status,
                  date,
                  subjects!attendance_subject_id_fkey (
                    name
                  )
                `)
                .eq('student_id', student.id);

              return {
                ...student,
                profile: profileData,
                grades: (gradesData || []).map((g: any) => ({
                  ...g,
                  subject: g.subjects,
                })),
                attendance: (attendanceData || []).map((a: any) => ({
                  ...a,
                  subject: a.subjects,
                })),
              };
            })
          );

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
      setNewAttendance({ status: "prezent", subjectId: "" });
      fetchData();
    } catch (error: any) {
      if (error.code === '23505') {
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
    if (!selectedStudent || selectedAbsences.length === 0) {
      toast({
        title: "Eroare",
        description: "Selectează absențele de motivat",
        variant: "destructive",
      });
      return;
    }

    try {
      for (const absenceId of selectedAbsences) {
        const { error } = await supabase
          .from('attendance')
          .update({ status: 'motivat' })
          .eq('id', absenceId);
        
        if (error) throw error;
      }

      toast({
        title: "Absențe motivate",
        description: `${selectedAbsences.length} absențe au fost motivate pentru ${selectedStudent.full_name || selectedStudent.profile?.full_name}`,
      });

      setIsMotivateOpen(false);
      setSelectedAbsences([]);
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
    return attendance.filter(a => a.status === 'absent').length;
  };

  const getUnmotivatedAbsences = (attendance: { id: string; status: string; date: string; subject: { name: string } }[]) => {
    return attendance.filter(a => a.status === 'absent');
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
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Panou Profesor</h1>
            <p className="text-sm text-muted-foreground">Gestionează elevii clasei tale</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
          </div>
        </header>

        <div className="p-8">
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
                                  <Select value={newGrade.subjectId} onValueChange={(v) => setNewGrade(p => ({ ...p, subjectId: v }))}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Selectează materia" />
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
                                Prezență
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Înregistrează prezența pentru {student.full_name || student.profile?.full_name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                <div>
                                  <Label>Materie</Label>
                                  <Select value={newAttendance.subjectId} onValueChange={(v) => setNewAttendance(p => ({ ...p, subjectId: v }))}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Selectează materia" />
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
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="prezent">Prezent</SelectItem>
                                      <SelectItem value="absent">Absent</SelectItem>
                                      <SelectItem value="intarziat">Întârziat</SelectItem>
                                      <SelectItem value="motivat">Motivat</SelectItem>
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
                                    <Button onClick={handleMotivateAbsences} className="w-full" disabled={selectedAbsences.length === 0}>
                                      Motivează ({selectedAbsences.length}) absențe
                                    </Button>
                                  </>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>

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
        </div>
      </main>
    </div>
  );
};

export default TeacherDashboard;
