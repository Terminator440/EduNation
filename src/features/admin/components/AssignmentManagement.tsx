import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Link2, BookOpen, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  assignTeacherToSubject,
  assignStudentToParent,
  type UserWithRoles,
} from "../services/user-management.service";
import { fetchUsers } from "../services/user-management.service";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuditLog, AUDIT_ACTIONS } from "@/hooks/useAuditLog";

type Student = {
  id: string;
  full_name: string | null;
  student_number: number | null;
  class_id: string;
  class_name?: string;
};

type Subject = {
  id: string;
  name: string;
  class_id: string;
  teacher_id: string | null;
  teacher_name?: string | null;
  class_name?: string;
};

type ParentStudentRelation = {
  id: string;
  parent_user_id: string;
  student_id: string;
  is_primary: boolean;
  parent_name: string;
  student_name: string;
};

export function AssignmentManagement() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { logAction } = useAuditLog();

  const [activeTab, setActiveTab] = useState<"teacher-subject" | "student-parent">("teacher-subject");
  
  // Teacher-Subject assignment
  const [teacherSubjectDialogOpen, setTeacherSubjectDialogOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<UserWithRoles[]>([]);

  // Student-Parent assignment
  const [studentParentDialogOpen, setStudentParentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [selectedParent, setSelectedParent] = useState<string>("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<UserWithRoles[]>([]);

  // Fetch teachers
  useEffect(() => {
    fetchUsers(0, 1000).then(({ users }) => {
      setTeachers(users.filter((u) => u.roles.includes("teacher") || u.roles.includes("homeroom_teacher")));
    });
  }, []);

  // Fetch parents
  useEffect(() => {
    fetchUsers(0, 1000).then(({ users }) => {
      setParents(users.filter((u) => u.roles.includes("parent")));
    });
  }, []);

  // Fetch subjects
  useEffect(() => {
    if (profile?.school_id) {
      supabase
        .from("subjects")
        .select(`
          id,
          name,
          class_id,
          teacher_id,
          classes(name, year, section),
          profiles:teacher_id(full_name)
        `)
        .eq("school_id", profile.school_id)
        .then(({ data }) => {
          setSubjects(
            (data || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              class_id: s.class_id,
              teacher_id: s.teacher_id,
              teacher_name: s.profiles?.full_name || null,
              class_name: s.classes ? `${s.classes.name} (${s.classes.year}${s.classes.section})` : null,
            }))
          );
        });
    }
  }, [profile?.school_id]);

  // Fetch students
  useEffect(() => {
    if (profile?.school_id) {
      supabase
        .from("students")
        .select(`
          id,
          full_name,
          student_number,
          class_id,
          classes(name, year, section)
        `)
        .eq("school_id", profile.school_id)
        .then(({ data }) => {
          setStudents(
            (data || []).map((s: any) => ({
              id: s.id,
              full_name: s.full_name,
              student_number: s.student_number,
              class_id: s.class_id,
              class_name: s.classes ? `${s.classes.name} (${s.classes.year}${s.classes.section})` : null,
            }))
          );
        });
    }
  }, [profile?.school_id]);

  // Fetch parent-student relations
  const relationsQuery = useQuery({
    queryKey: ["parent-student-relations"],
    queryFn: async (): Promise<ParentStudentRelation[]> => {
      if (!profile?.school_id) return [];

      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", profile.school_id);

      const studentIds = (students || []).map((s) => s.id);
      if (studentIds.length === 0) return [];

      const { data: relations } = await supabase
        .from("parent_student_relations")
        .select(`
          id,
          parent_user_id,
          student_id,
          is_primary,
          profiles:parent_user_id(full_name),
          students:student_id(full_name)
        `)
        .in("student_id", studentIds);

      return (relations || []).map((r: any) => ({
        id: r.id,
        parent_user_id: r.parent_user_id,
        student_id: r.student_id,
        is_primary: r.is_primary || false,
        parent_name: r.profiles?.full_name || "Fără nume",
        student_name: r.students?.full_name || "Fără nume",
      }));
    },
  });

  const assignTeacherMutation = useMutation({
    mutationFn: ({ teacherId, subjectId }: { teacherId: string; subjectId: string }) =>
      assignTeacherToSubject(teacherId, subjectId),
    onSuccess: async (_, variables) => {
      await logAction({
        action: AUDIT_ACTIONS.USER_ROLE_SWITCH,
        entityType: "subject_assignment",
        entityId: variables.subjectId,
        newData: { teacher_id: variables.teacherId },
      });

      queryClient.invalidateQueries({ queryKey: ["parent-student-relations"] });
      // Refresh subjects
      if (profile?.school_id) {
        supabase
          .from("subjects")
          .select(`
            id,
            name,
            class_id,
            teacher_id,
            classes(name, year, section),
            profiles:teacher_id(full_name)
          `)
          .eq("school_id", profile.school_id)
          .then(({ data }) => {
            setSubjects(
              (data || []).map((s: any) => ({
                id: s.id,
                name: s.name,
                class_id: s.class_id,
                teacher_id: s.teacher_id,
                teacher_name: s.profiles?.full_name || null,
                class_name: s.classes ? `${s.classes.name} (${s.classes.year}${s.classes.section})` : null,
              }))
            );
          });
      }

      setTeacherSubjectDialogOpen(false);
      setSelectedTeacher("");
      setSelectedSubject("");
      toast.success("Asignare realizată", {
        description: "Profesorul a fost asignat la materie.",
      });
    },
    onError: (error: Error) => {
      toast.error("Eroare", {
        description: error.message || "Nu s-a putut realiza asignarea.",
      });
    },
  });

  const assignParentMutation = useMutation({
    mutationFn: ({
      studentId,
      parentId,
      isPrimary,
    }: {
      studentId: string;
      parentId: string;
      isPrimary: boolean;
    }) => assignStudentToParent(studentId, parentId, isPrimary),
    onSuccess: async (_, variables) => {
      await logAction({
        action: AUDIT_ACTIONS.STUDENT_UPDATE,
        entityType: "parent_student_relation",
        entityId: variables.studentId,
        newData: { parent_id: variables.parentId, is_primary: variables.isPrimary },
      });

      queryClient.invalidateQueries({ queryKey: ["parent-student-relations"] });
      setStudentParentDialogOpen(false);
      setSelectedStudent("");
      setSelectedParent("");
      setIsPrimary(false);
      toast.success("Asignare realizată", {
        description: "Părintele a fost asignat elevului.",
      });
    },
    onError: (error: Error) => {
      toast.error("Eroare", {
        description: error.message || "Nu s-a putut realiza asignarea.",
      });
    },
  });

  const handleAssignTeacher = () => {
    if (!selectedTeacher || !selectedSubject) {
      toast.error("Eroare", {
        description: "Selectează profesorul și materia.",
      });
      return;
    }
    assignTeacherMutation.mutate({
      teacherId: selectedTeacher,
      subjectId: selectedSubject,
    });
  };

  const handleAssignParent = () => {
    if (!selectedStudent || !selectedParent) {
      toast.error("Eroare", {
        description: "Selectează elevul și părintele.",
      });
      return;
    }
    assignParentMutation.mutate({
      studentId: selectedStudent,
      parentId: selectedParent,
      isPrimary,
    });
  };

  const teacherSubjectColumns: DataTableColumn<Subject>[] = [
    {
      key: "name",
      header: "Materie",
      accessor: (r) => r.name,
    },
    {
      key: "class",
      header: "Clasă",
      accessor: (r) => r.class_name || "",
      render: (row) => <span>{row.class_name || "—"}</span>,
    },
    {
      key: "teacher",
      header: "Profesor",
      render: (row) => (
        <span className={row.teacher_name ? "" : "text-muted-foreground"}>
          {row.teacher_name || "Neasignat"}
        </span>
      ),
    },
  ];

  const relationsColumns: DataTableColumn<ParentStudentRelation>[] = [
    {
      key: "student",
      header: "Elev",
      accessor: (r) => r.student_name,
    },
    {
      key: "parent",
      header: "Părinte",
      accessor: (r) => r.parent_name,
    },
    {
      key: "is_primary",
      header: "Principal",
      render: (row) => (
        <span className={row.is_primary ? "text-primary font-semibold" : "text-muted-foreground"}>
          {row.is_primary ? "Da" : "Nu"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestionare Asignări</h2>
          <p className="text-sm text-muted-foreground">
            Asignează profesori la materii și părinți la elevi
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="teacher-subject">
            <BookOpen className="w-4 h-4 mr-2" />
            Profesor - Materie
          </TabsTrigger>
          <TabsTrigger value="student-parent">
            <Users className="w-4 h-4 mr-2" />
            Elev - Părinte
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teacher-subject" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={teacherSubjectDialogOpen} onOpenChange={setTeacherSubjectDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Link2 className="w-4 h-4 mr-2" />
                  Asignează profesor
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Asignează profesor la materie</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Profesor</Label>
                    <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectează profesor" />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.full_name} ({t.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Materie</Label>
                    <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectează materie" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} - {s.class_name || "Fără clasă"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleAssignTeacher}
                    disabled={assignTeacherMutation.isPending}
                    className="w-full"
                  >
                    {assignTeacherMutation.isPending ? "Se asignează..." : "Asignează"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <DataTable
            data={subjects}
            columns={teacherSubjectColumns}
            rowKey={(r) => r.id}
            emptyMessage="Nu există materii."
          />
        </TabsContent>

        <TabsContent value="student-parent" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={studentParentDialogOpen} onOpenChange={setStudentParentDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Link2 className="w-4 h-4 mr-2" />
                  Asignează părinte
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Asignează părinte la elev</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Elev</Label>
                    <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectează elev" />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name || "Fără nume"} - {s.class_name || "Fără clasă"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Părinte</Label>
                    <Select value={selectedParent} onValueChange={setSelectedParent}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectează părinte" />
                      </SelectTrigger>
                      <SelectContent>
                        {parents.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name} ({p.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is-primary"
                      checked={isPrimary}
                      onChange={(e) => setIsPrimary(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="is-primary" className="cursor-pointer">
                      Părinte principal
                    </Label>
                  </div>
                  <Button
                    onClick={handleAssignParent}
                    disabled={assignParentMutation.isPending}
                    className="w-full"
                  >
                    {assignParentMutation.isPending ? "Se asignează..." : "Asignează"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <DataTable
            data={relationsQuery.data || []}
            columns={relationsColumns}
            rowKey={(r) => r.id}
            loading={relationsQuery.isLoading}
            emptyMessage="Nu există asignări părinte-elev."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
