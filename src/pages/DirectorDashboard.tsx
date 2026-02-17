import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useNavigate } from "react-router-dom";
/* Lucide: import doar iconițele folosite (tree-shaking) — nu importa întreaga librărie */
import { Users, GraduationCap, TrendingUp, FileText, Shield, Bell, BarChart3, Building, Megaphone, Search } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagination } from "@/hooks/usePagination";
import { supabase } from "@/integrations/supabase/client";
import { CreateInvitationDialog } from "@/components/invitations/CreateInvitationDialog";
import { CreateAnnouncementDialog } from "@/components/announcements/CreateAnnouncementDialog";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

const DirectorDashboardChart = lazy(() => import("./DirectorDashboardChart"));

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

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
  target_role: string | null;
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
  const [schoolName, setSchoolName] = useState<string>("");
  const [directorInvitations, setDirectorInvitations] = useState<InvitationWithDetails[]>([]);
  const [directorInvLoading, setDirectorInvLoading] = useState(false);

  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);
  const [recentAnnouncements, setRecentAnnouncements] = useState<AnnouncementRow[]>([]);

  const [gradesDistributionRaw, setGradesDistributionRaw] = useState<{ grade: number; cnt: number }[]>([]);

  // Search/filter for invitations (debounced search to avoid work on every keystroke)
  const [invSearchQuery, setInvSearchQuery] = useState("");
  const [invRoleFilter, setInvRoleFilter] = useState<string>("all");
  const invSearchDebounced = useDebouncedValue(invSearchQuery, 300);

  const navigate = useNavigate();

  const gradeChartData = useMemo(() => {
    const fromDb = gradesDistributionRaw;
    const map = new Map(fromDb.map((r) => [r.grade, r.cnt]));
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((grade) => ({
      nota: String(grade),
      count: map.get(grade) ?? 0,
    }));
  }, [gradesDistributionRaw]);

  const averageGradeDisplay = useMemo(
    () => (stats.averageGrade > 0 ? stats.averageGrade.toFixed(2) : "-"),
    [stats.averageGrade]
  );

  const gradesSubtitle = useMemo(
    () => `Din ${stats.totalGrades} note`,
    [stats.totalGrades]
  );

  const filteredInvitations = useMemo(() => {
    let list = directorInvitations;
    const q = invSearchDebounced.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (inv) =>
          (inv.invited_email?.toLowerCase().includes(q)) ||
          (inv.invited_phone?.includes(q)) ||
          (inv.first_name?.toLowerCase().includes(q)) ||
          (inv.last_name?.toLowerCase().includes(q))
      );
    }
    if (invRoleFilter !== "all") {
      list = list.filter((inv) => inv.role === invRoleFilter);
    }
    return list;
  }, [directorInvitations, invSearchDebounced, invRoleFilter]);

  const invScrollRef = useRef<HTMLDivElement>(null);
  const INV_ROW_HEIGHT = 56;
  const invVirtualizer = useVirtualizer({
    count: filteredInvitations.length,
    getScrollElement: () => invScrollRef.current,
    estimateSize: () => INV_ROW_HEIGHT,
    overscan: 6,
  });
  const invVirtualItems = invVirtualizer.getVirtualItems();
  const invTotalSize = invVirtualizer.getTotalSize();

  const auditPagination = usePagination(auditLogs, { initialPage: 1, initialPageSize: 10 });

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
          .select("school_id, schools(name)")
          .eq("id", user.id)
          .maybeSingle();

        if (profileErr) throw profileErr;

        const sid = profileData?.school_id ?? null;
        setDirectorSchoolId(sid);
        const name = (profileData?.schools as { name: string } | null)?.name ?? "";
        setSchoolName(name);

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


  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, content, created_at, target_role')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setRecentAnnouncements((data ?? []) as AnnouncementRow[]);
    } catch {
      setRecentAnnouncements([]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { count: studentsCount },
        { count: classesCount },
        { count: teachersCount },
        { data: gradesStatsData },
        { data: gradesDistData },
        { count: absencesCount },
        { count: activeUsersCount },
        { data: logsData },
      ] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('classes').select('*', { count: 'exact', head: true }),
        supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .in('role', ['teacher', 'homeroom_teacher']),
        supabase.rpc('get_school_grades_stats'),
        supabase.rpc('get_grades_distribution'),
        supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .in('status', ['unexcused', 'pending']),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase
          .from('audit_logs')
          .select('id, user_name, active_role, action, entity_type, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      const gradesStats = Array.isArray(gradesStatsData) && gradesStatsData.length > 0
        ? gradesStatsData[0] as { total_count: number | null; average_grade: number | null }
        : null;
      const totalGrades = Number(gradesStats?.total_count ?? 0);
      const avgGrade = gradesStats?.average_grade != null ? Number(gradesStats.average_grade) : 0;

      setStats({
        totalStudents: studentsCount || 0,
        totalTeachers: teachersCount || 0,
        totalClasses: classesCount || 0,
        totalGrades,
        averageGrade: avgGrade,
        totalAbsences: absencesCount || 0,
        activeUsers: activeUsersCount || 0,
      });

      setAuditLogs(logsData || []);

      const distRows = (gradesDistData ?? []) as { grade: number; cnt: number }[];
      setGradesDistributionRaw(distRows);

      // attendance_excuse_requests table doesn't exist yet - skip
      setPendingExcuseRequests([]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && activeRole === 'director') {
      fetchData();
      fetchAnnouncements();
    }
  }, [user, activeRole, fetchData, fetchAnnouncements]);

  const decideExcuseRequest = useCallback(
    async (_req: PendingExcuseRequest, _decision: 'approved' | 'rejected') => {
      toast({ title: 'Info', description: 'Funcționalitate indisponibilă - tabela nu există.' });
    },
    [toast]
  );

  const getRoleLabel = useCallback((role: string) => {
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
  }, []);

  const handleRevokeInvitation = useCallback(
    async (invId: string) => {
      try {
        await revokeInvitation(invId);
        if (directorSchoolId) {
          const invs = await listInvitations({ schoolId: directorSchoolId, limit: 100 });
          setDirectorInvitations(invs);
        }
      } catch (e) {
        console.error("Failed to revoke invitation:", e);
      }
    },
    [directorSchoolId]
  );

  const handleInvitationsCreated = useCallback(async () => {
    if (directorSchoolId) {
      const invs = await listInvitations({ schoolId: directorSchoolId, limit: 100 });
      setDirectorInvitations(invs);
    }
  }, [directorSchoolId]);

  const openAnnouncementDialog = useCallback(() => setAnnouncementDialogOpen(true), []);
  const openInviteDialogTeacher = useCallback(() => {
    setInvRole("teacher");
    setInvDialogOpen(true);
  }, []);
  const openInviteDialogHomeroom = useCallback(() => {
    setInvRole("homeroom_teacher");
    setInvDialogOpen(true);
  }, []);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="md" className="text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Panou Director"
      subtitle={schoolName || undefined}
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
              value={averageGradeDisplay}
              subtitle={gradesSubtitle}
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
            <Button className="gap-2" onClick={openAnnouncementDialog}>
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

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* Grafic recharts – chunk separat, mai puțin RAM pe dispozitive slabe */}
              <Suspense
                fallback={
                  <Card className="content-visibility-auto">
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-64 mt-2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-[17.5rem] w-full rounded-lg" />
                    </CardContent>
                  </Card>
                }
              >
                <DirectorDashboardChart data={gradeChartData} />
              </Suspense>

              {/* Audit Logs — max 10 rânduri per pagină; pe mobil mai puține coloane */}
              <Card className="content-visibility-auto">
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
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="whitespace-nowrap">Utilizator</TableHead>
                              <TableHead className="hidden sm:table-cell whitespace-nowrap">Rol</TableHead>
                              <TableHead className="whitespace-nowrap">Acțiune</TableHead>
                              <TableHead className="hidden md:table-cell whitespace-nowrap">Entitate</TableHead>
                              <TableHead className="whitespace-nowrap">Data/Ora</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {auditPagination.paginatedData.map((log) => (
                              <TableRow key={log.id}>
                                <TableCell className="font-medium whitespace-nowrap">{log.user_name}</TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                    {getRoleLabel(log.active_role)}
                                  </span>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{log.action}</TableCell>
                                <TableCell className="hidden md:table-cell text-muted-foreground whitespace-nowrap">{log.entity_type || '-'}</TableCell>
                                <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                  {new Date(log.created_at).toLocaleString('ro-RO')}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-4">
                        <PaginationControls
                          page={auditPagination.page}
                          totalPages={auditPagination.totalPages}
                          totalItems={auditPagination.totalItems}
                          pageSize={auditPagination.pageSize}
                          onPageChange={auditPagination.goToPage}
                          onPageSizeChange={auditPagination.setPageSize}
                          pageSizeOptions={[10, 15]}
                          showPageSize={true}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick Stats — coloană dreaptă, de obicei sub fold */}
            <div className="space-y-6 content-visibility-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5" />
                    Ultimele anunțuri
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recentAnnouncements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nu există anunțuri recente.</p>
                  ) : (
                    <div className="space-y-3">
                      {recentAnnouncements.map((a) => (
                        <div key={a.id} className="p-3 rounded-lg border border-border">
                          <p className="font-medium text-sm">{a.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.created_at).toLocaleString('ro-RO')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

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
          <Card className="mt-8 content-visibility-auto">
            <CardHeader className="flex flex-col sm:flex-row items-start gap-4">
              <CardTitle>Invitații (director)</CardTitle>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Button variant="outline" onClick={openInviteDialogTeacher}>
                  Invită profesor
                </Button>
                <Button variant="outline" onClick={openInviteDialogHomeroom}>
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
                <>
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Caută după email, telefon, nume..."
                        value={invSearchQuery}
                        onChange={(e) => setInvSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={invRoleFilter} onValueChange={setInvRoleFilter}>
                      <SelectTrigger className="w-full sm:w-[11.25rem]">
                        <SelectValue placeholder="Rol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toate rolurile</SelectItem>
                        <SelectItem value="teacher">Profesor</SelectItem>
                        <SelectItem value="homeroom_teacher">Diriginte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full border rounded-md overflow-hidden">
                    <div
                      className="grid grid-cols-[6rem_5rem_7rem_7rem_1fr_5rem] gap-2 px-4 py-3 border-b bg-muted/40 text-sm font-medium"
                      role="row"
                    >
                      <div className="whitespace-nowrap">Rol</div>
                      <div className="whitespace-nowrap">Status</div>
                      <div className="whitespace-nowrap">Creat</div>
                      <div className="whitespace-nowrap">Expiră</div>
                      <div className="whitespace-nowrap min-w-0">Contact</div>
                      <div className="text-right whitespace-nowrap">Acțiuni</div>
                    </div>
                    <div
                      ref={invScrollRef}
                      className="overflow-auto overscroll-contain"
                      style={{ minHeight: 240, maxHeight: "40vh" }}
                      role="table"
                      aria-rowcount={filteredInvitations.length}
                    >
                      {filteredInvitations.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          {invSearchQuery.trim() || invRoleFilter !== "all"
                            ? "Niciun rezultat pentru filtrele alese."
                            : "Nu ai invitații create."}
                        </div>
                      ) : (
                        <div style={{ height: invTotalSize, position: "relative", width: "100%" }}>
                          {invVirtualItems.map((virtualRow) => {
                            const inv = filteredInvitations[virtualRow.index];
                            return (
                              <div
                                key={inv.id}
                                data-index={virtualRow.index}
                                className="grid grid-cols-[6rem_5rem_7rem_7rem_1fr_5rem] gap-2 px-4 py-3 border-b items-center text-sm absolute left-0 w-full hover:bg-muted/50"
                                style={{
                                  transform: `translateY(${virtualRow.start}px)`,
                                  minHeight: INV_ROW_HEIGHT,
                                }}
                                role="row"
                              >
                                <div>{getRoleLabelRo(inv.role)}</div>
                                <div>{getStatusLabelRo(getInvitationStatus(inv))}</div>
                                <div>
                                  {inv.created_at ? new Date(inv.created_at).toLocaleString("ro-RO") : "-"}
                                </div>
                                <div>
                                  {inv.expires_at ? new Date(inv.expires_at).toLocaleString("ro-RO") : "-"}
                                </div>
                                <div className="min-w-0">
                                  {inv.invited_email || inv.invited_phone ? (
                                    <div className="text-xs">
                                      {inv.invited_email && <div className="truncate">{inv.invited_email}</div>}
                                      {inv.invited_phone && <div>{inv.invited_phone}</div>}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!!inv.revoked_at || !!inv.used_at}
                                    onClick={() => handleRevokeInvitation(inv.id)}
                                  >
                                    Revocă
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <CreateInvitationDialog
          open={invDialogOpen}
          onOpenChange={setInvDialogOpen}
          schoolId={directorSchoolId || ""}
          role={invRole}
          onCreated={handleInvitationsCreated}
        />

        <CreateAnnouncementDialog
          open={announcementDialogOpen}
          onOpenChange={setAnnouncementDialogOpen}
          authorId={user?.id ?? ""}
          schoolId={directorSchoolId}
          onCreated={fetchAnnouncements}
        />
    </DashboardLayout>
  );
};

export default DirectorDashboard;