import { useMemo, useState } from "react";
import { Users, GraduationCap, FileText, Calendar, Plus, Upload, Search } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClasses, useCreateStudentWithActivation, useStudentsForSecretariat } from "@/features/secretariat/queries";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const SecretariatDashboard = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentClassId, setNewStudentClassId] = useState<string>("");
  const [newStudentContact, setNewStudentContact] = useState<string>("");
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const classesQuery = useClasses();
  const studentsQuery = useStudentsForSecretariat(searchQuery);
  const createStudent = useCreateStudentWithActivation();

  const stats = useMemo(() => {
    const students = studentsQuery.data ?? [];
    const totalStudents = students.length;
    const activeStudents = students.filter(s => s.is_active).length;
    const inactiveStudents = totalStudents - activeStudents;
    const classesCount = (classesQuery.data ?? []).length;
    return { totalStudents, activeStudents, inactiveStudents, classesCount };
  }, [studentsQuery.data, classesQuery.data]);

  
  const parseEmailOrPhone = (value: string): { email: string | null; phone: string | null } => {
    const v = value.trim();
    if (!v) return { email: null, phone: null };
    if (v.includes('@')) return { email: v.toLowerCase(), phone: null };
    // Normalize phone: keep + and digits
    const phone = v.replace(/[^0-9+]/g, '');
    return { email: null, phone: phone || null };
  };

const handleCreateStudent = async () => {
    if (!user) return;
    if (!newStudentName.trim() || !newStudentClassId) {
      toast({
        title: "Date incomplete",
        description: "Completează numele elevului și clasa.",
        variant: "destructive",
      });
      return;
    }
    try {
      const parsed = parseEmailOrPhone(newStudentContact);
      const res = await createStudent.mutateAsync({
        full_name: newStudentName.trim(),
        class_id: newStudentClassId,
        created_by: user.id,
        expires_in_days: 14,
        contact_email: parsed.email,
        contact_phone: parsed.phone,
      });
      setNewStudentName("");
      setNewStudentContact("");
      toast({
        title: "Elev creat + cod generat",
        description: `Cod activare: ${res.activation_code} (expiră: ${new Date(res.expires_at).toLocaleString('ro-RO')})`,
      });
    } catch (e: any) {
      toast({
        title: "Eroare",
        description: e?.message ?? "Nu am putut crea elevul.",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout
      title="Panou Secretariat"
      subtitle="Gestionare elevi și clase"
    >
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Total Elevi"
              value={String(stats.totalStudents)}
              subtitle={`Activi: ${stats.activeStudents} • Inactivi: ${stats.inactiveStudents}`}
              icon={Users}
              variant="primary"
            />
            <StatsCard
              title="Clase"
              value={String(stats.classesCount)}
              subtitle="Din baza de date"
              icon={GraduationCap}
              variant="success"
            />
            <StatsCard
              title="Elevi"
              value={String(stats.activeStudents)}
              subtitle="Marcați activi"
              icon={Users}
              variant="accent"
            />
            <StatsCard
              title="Rapoarte"
              value="—"
              subtitle="(de adăugat: rapoarte)"
              icon={FileText}
              variant="warning"
            />
          </div>

          {/* Actions */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Adaugă elev + generează cod
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <Label>Nume elev</Label>
                <Input
                  placeholder="Nume Prenume"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                />
              </div>
              <div className="md:col-span-1">
                <Label>Clasă</Label>
                <Select value={newStudentClassId || undefined} onValueChange={setNewStudentClassId} disabled={classesQuery.isLoading || (classesQuery.data ?? []).length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={classesQuery.isLoading ? "Se încarcă..." : (classesQuery.data ?? []).length === 0 ? "Nu există clase" : "Alege clasa"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(classesQuery.data ?? []).map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1">
                <Label>Email sau telefon (opțional)</Label>
                <Input
                  placeholder="ex: parinte@email.ro sau 07xx xxx xxx"
                  value={newStudentContact}
                  onChange={(e) => setNewStudentContact(e.target.value)}
                />
              </div>

              <div className="md:col-span-1 flex items-end">
                <Button
                  className="gap-2 w-full"
                  onClick={handleCreateStudent}
                  disabled={createStudent.isPending || classesQuery.isLoading}
                >
                  <Plus className="h-4 w-4" />
                  {createStudent.isPending ? "Se creează..." : "Creează + cod"}
                </Button>
              </div>
              <div className="md:col-span-3 text-sm text-muted-foreground">
                Codul apare în notificare după creare. Pentru import CSV și rapoarte, trebuie adăugate fluxuri dedicate.
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Students Table */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Lista Elevi</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Caută elev..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nume</TableHead>
                        <TableHead>Clasă</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data înscrierii</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(studentsQuery.data ?? []).map((student) => {
                        const classLabel = student.class ? student.class.name : '—';
                        const statusLabel = student.is_active ? 'Activ' : 'Inactiv';
                        return (
                          <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.full_name ?? '—'}</TableCell>
                          <TableCell>{classLabel}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              statusLabel === "Activ" 
                                ? "bg-success/10 text-success" 
                                : "bg-muted text-muted-foreground"
                            )}>
                              {statusLabel}
                            </span>
                          </TableCell>
                          <TableCell>—</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Classes */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Clase</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(classesQuery.data ?? []).map((cls) => {
                    const studentsInClass = (studentsQuery.data ?? []).filter(s => s.class?.id === cls.id).length;
                    return (
                      <div key={cls.id} className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-foreground">{cls.name}</span>
                          <span className="text-sm text-muted-foreground">{studentsInClass} elevi</span>
                        </div>
                        <p className="text-sm text-muted-foreground">An: {cls.year} • Secțiunea: {cls.section}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
    </DashboardLayout>
  );
};

export default SecretariatDashboard;
