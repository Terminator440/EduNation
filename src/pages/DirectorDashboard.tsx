import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, GraduationCap, TrendingUp, FileText, Shield, Bell, BarChart3, Building } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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

import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SchoolStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalGrades: number;
  averageGrade: number;
  totalAbsences: number;
  activeUsers: number;
}

interface AuditLog {
  id: string;
  user_name: string;
  active_role: string;
  action: string;
  entity_type: string | null;
  created_at: string;
}

interface PendingExcuseRequest {
  id: string;
  reason: string;
  created_at: string;
  status: string;
  attendance: {
    id: string;
    date: string;
    status: string;
    students: { full_name: string | null } | null;
    subjects: { name: string } | null;
  } | null;
}

const DirectorDashboard = () => {
  const [stats, setStats] = useState<SchoolStats>({
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalGrades: 0,
    averageGrade: 0,
    totalAbsences: 0,
    activeUsers: 0,
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [pendingExcuseRequests, setPendingExcuseRequests] = useState<PendingExcuseRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const { toast } = useToast();

  const { user, activeRole, loading: authLoading } = useAuth();

  // Invitatii (director)
  const [invDialogOpen, setInvDialogOpen] = useState(false);
  const [invRole, setInvRole] = useState<InvitationRole>("teacher");
  const [directorSchoolId, setDirectorSchoolId] = useState<string | null>(null);
  const [directorInvitations, setDirectorInvitations] = useState<InvitationWithDetails[]>([]);
  const [directorInvLoading, setDirectorInvLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!user || activeRole !== 'director')) {
      navigate('/auth');
    }
  }, [user, activeRole, authLoading, navigate]);

  useEffect(() => {
    const loadDirectorInvitations = async () => {
      try {
        if (!user || activeRole !== "director") return;

        setDirectorInvLoading(true);

        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("school_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profileErr) throw profileErr;

        const sid = profileData?.school_id ?? null;
        setDirectorSchoolId(sid);

        if (sid) {
          const invs = await listInvitations({ schoolId: sid, limit: 100 });
          setDirectorInvitations(invs);
        } else {
          setDirectorInvitations([]);
        }
      } catch (e) {
        console.error("Failed to load director invitations:", e);
        setDirectorInvitations([]);
      } finally {
        setDirectorInvLoading(false);
      }
    };

    void loadDirectorInvitations();
  }, [user, activeRole]);


  useEffect(() => {
    if (user && activeRole === 'director') {
      fetchData();
    }
  }, [user, activeRole]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch students count
      const { count: studentsCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      // Fetch classes count
      const { count: classesCount } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true });

      // Fetch teachers count
      const { count: teachersCount } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .in('role', ['teacher', 'homeroom_teacher']);

      // Fetch all grades for average
      const { data: gradesData } = await supabase
        .from('grades')
        .select('grade');

      const totalGrades = gradesData?.length || 0;
      const avgGrade = gradesData && gradesData.length > 0
        ? gradesData.reduce((sum, g) => sum + Number(g.grade), 0) / gradesData.length
        : 0;

      // Fetch absences count (unexcused + pending)
      const { count: absencesCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .in('status', ['unexcused', 'pending']);

      // Fetch profiles count (active users)
      const { count: activeUsersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalStudents: studentsCount || 0,
        totalTeachers: teachersCount || 0,
        totalClasses: classesCount || 0,
        totalGrades,
        averageGrade: avgGrade,
        totalAbsences: absencesCount || 0,
        activeUsers: activeUsersCount || 0,
      });

      // Fetch audit logs
      const { data: logsData } = await supabase
        .from('audit_logs')
        .select('id, user_name, active_role, action, entity_type, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      setAuditLogs(logsData || []);

      // attendance_excuse_requests table doesn't exist yet - skip
      setPendingExcuseRequests([]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const decideExcuseRequest = async (_req: PendingExcuseRequest, _decision: 'approved' | 'rejected') => {
    // attendance_excuse_requests table doesn't exist yet
    toast({ title: 'Info', description: 'Funcționalitate indisponibilă - tabela nu există.' });
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      student: 'Elev',
      parent: 'Părinte',
      teacher: 'Profesor',
      homeroom_teacher: 'Diriginte',
      secretariat: 'Secretariat',
      director: 'Director',
      uat_admin: 'Admin UAT',
    };
    return labels[role] || role;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Panou Director"
      subtitle="Liceul Teoretic &quot;Nicolae Balcescu&quot;"
    >
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              title="Total Elevi"
              value={stats.totalStudents.toString()}
              subtitle={`${stats.totalClasses} clase`}
              icon={Users}
              variant="primary"
            />
            <StatsCard
              title="Profesori"
              value={stats.totalTeachers.toString()}
              subtitle="Activi"
              icon={GraduationCap}
              variant="success"
            />
            <StatsCard
              title="Media Generală"
              value={stats.averageGrade > 0 ? stats.averageGrade.toFixed(2) : "-"}
              subtitle={`Din ${stats.totalGrades} note`}
              icon={TrendingUp}
              variant="accent"
            />
            <StatsCard
              title="Absențe"
              value={stats.totalAbsences.toString()}
              subtitle="Total nemotivate"
              icon={BarChart3}
              variant="warning"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-4 mb-8">
            <Button className="gap-2">
              <Bell className="h-4 w-4" />
              Publică Anunț
            </Button>
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Generează Raport
            </Button>
            <Button variant="outline" className="gap-2">
              <Shield className="h-4 w-4" />
              Gestionare Roluri
            </Button>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Audit Logs */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Jurnal Audit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {auditLogs.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Nu există înregistrări în jurnalul de audit.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Utilizator</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead>Acțiune</TableHead>
                          <TableHead>Entitate</TableHead>
                          <TableHead>Data/Ora</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-medium">{log.user_name}</TableCell>
                            <TableCell>
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {getRoleLabel(log.active_role)}
                              </span>
                            </TableCell>
                            <TableCell>{log.action}</TableCell>
                            <TableCell className="text-muted-foreground">{log.entity_type || '-'}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(log.created_at).toLocaleString('ro-RO')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick Stats */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Cereri motivare absențe
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {pendingExcuseRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nu există cereri în așteptare.</p>
                  ) : (
                    <div className="space-y-3">
                      {pendingExcuseRequests.map((r) => (
                        <div key={r.id} className="p-3 rounded-lg border border-border">
                          <p className="font-medium">
                            {r.attendance?.students?.full_name ?? 'Elev'} • {r.attendance?.subjects?.name ?? 'Materie'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {r.attendance?.date ? new Date(r.attendance.date).toLocaleDateString('ro-RO') : ''}
                          </p>
                          <p className="text-sm mt-2">{r.reason}</p>
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" onClick={() => decideExcuseRequest(r, 'approved')}>
                              Aprobă
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => decideExcuseRequest(r, 'rejected')}>
                              Respinge
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Statistici Școală
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Clase active</span>
                    <span className="font-semibold">{stats.totalClasses}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Utilizatori înregistrați</span>
                    <span className="font-semibold">{stats.activeUsers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Note acordate</span>
                    <span className="font-semibold">{stats.totalGrades}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Absențe înregistrate</span>
                    <span className="font-semibold">{stats.totalAbsences}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Rapoarte Disponibile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <FileText className="h-4 w-4" />
                    Raport Prezență
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <FileText className="h-4 w-4" />
                    Raport Note
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <FileText className="h-4 w-4" />
                    Statistici Clase
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        {activeRole === "director" && (
          <Card className="mt-8">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Invitații (director)</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setInvRole("teacher");
                    setInvDialogOpen(true);
                  }}
                >
                  Invită profesor
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setInvRole("homeroom_teacher");
                    setInvDialogOpen(true);
                  }}
                >
                  Invită diriginte
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!directorSchoolId ? (
                <p className="text-sm text-muted-foreground">
                  Nu pot încărca invitațiile: profilul nu are setat school_id.
                </p>
              ) : directorInvLoading ? (
                <p className="text-sm text-muted-foreground">Se încarcă invitațiile...</p>
              ) : directorInvitations.length === 0 ? (
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
                    {directorInvitations.map((inv) => (
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
                                if (directorSchoolId) {
                                  const invs = await listInvitations({ schoolId: directorSchoolId, limit: 100 });
                                  setDirectorInvitations(invs);
                                }
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
          open={invDialogOpen}
          onOpenChange={setInvDialogOpen}
          schoolId={directorSchoolId || ""}
          role={invRole}
          onCreated={async () => {
            if (directorSchoolId) {
              const invs = await listInvitations({ schoolId: directorSchoolId, limit: 100 });
              setDirectorInvitations(invs);
            }
          }}
        />
    </DashboardLayout>
  );
};

export default DirectorDashboard;