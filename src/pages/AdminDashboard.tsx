import { useMemo, useState, useCallback } from "react";
import { Shield, Users, GraduationCap, ClipboardList, CalendarDays, Plus, Trash2, Building2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { addUserRole, removeUserRole } from "@/features/admin/services/user-management.service";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { fetchSchoolsForGlobalAdmin, fetchGlobalStats, fetchAllUsersForAdmin } from "@/features/admin/services/global-admin.service";
import { BillingSection } from "@/features/billing/components/BillingSection";
import { SchoolOnboardingWizard } from "@/features/onboarding/components/SchoolOnboardingWizard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/spinner";

type AppRoleEnum = Database["public"]["Enums"]["app_role"];
type Role = Exclude<AppRoleEnum, "developer">; // Exclude developer from admin assignable roles

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  roles: Role[];
};

const AdminDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const onToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);
  const { user, activeRole } = useAuth();

  const isGlobalAdmin = activeRole === "uat_admin" || activeRole === "developer";

  const schoolsQuery = useQuery({
    queryKey: ["admin-schools"],
    queryFn: fetchSchoolsForGlobalAdmin,
    enabled: isGlobalAdmin,
  });

  const statsQuery = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const stats = await fetchGlobalStats();
      return {
        profiles: stats.users,
        classes: stats.classes,
        students: stats.students,
        grades: stats.grades,
        attendance: stats.attendance,
        events: 0,
      };
    },
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: (): Promise<UserRow[]> => fetchAllUsersForAdmin() as Promise<UserRow[]>,
  });

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<Role>('teacher');
  const [removeRoleConfirm, setRemoveRoleConfirm] = useState<{ userId: string; role: Role; userName: string } | null>(null);

  const assignRole = async () => {
    if (!selectedUserId) return;
    try {
      await addUserRole(selectedUserId, selectedRole);
      toast({ title: 'OK', description: 'Rol adăugat.' });
      await usersQuery.refetch();
    } catch (e) {
      toast({
        title: 'Eroare',
        description: e instanceof Error ? e.message : 'Nu s-a putut adăuga rolul.',
        variant: 'destructive',
      });
    }
  };

  const confirmRemoveRole = (userId: string, role: Role, userName: string) => {
    setRemoveRoleConfirm({ userId, role, userName });
  };

  const removeRole = async () => {
    if (!removeRoleConfirm) return;
    const { userId, role } = removeRoleConfirm;
    setRemoveRoleConfirm(null);
    try {
      await removeUserRole(userId, role);
      toast({ title: 'OK', description: 'Rol șters.' });
      await usersQuery.refetch();
    } catch (e) {
      toast({
        title: 'Eroare',
        description: e instanceof Error ? e.message : 'Nu s-a putut șterge rolul.',
        variant: 'destructive',
      });
    }
  };

  const currentUser = useMemo(() => usersQuery.data?.find(u => u.id === user?.id) ?? null, [usersQuery.data, user?.id]);

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />

      <main className={cn("w-full min-w-0 transition-all duration-300 will-change-transform pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64")}>
        <header className="w-full h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-14 md:top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Admin (UAT)</h1>
            <p className="text-sm text-muted-foreground">Management utilizatori, roluri și audit</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Adaugă rol</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adaugă rol unui utilizator</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger><SelectValue placeholder="Selectează utilizator" /></SelectTrigger>
                    <SelectContent>
                      {(usersQuery.data ?? []).map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={assignRole}>Salvează</Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border border-border p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Utilizatori</p><Users className="w-4 h-4 text-muted-foreground" /></div><p className="text-2xl font-bold mt-2">{statsQuery.data?.profiles ?? 0}</p></div>
            <div className="bg-card rounded-2xl border border-border p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Clase</p><GraduationCap className="w-4 h-4 text-muted-foreground" /></div><p className="text-2xl font-bold mt-2">{statsQuery.data?.classes ?? 0}</p></div>
            <div className="bg-card rounded-2xl border border-border p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Elevi</p><Users className="w-4 h-4 text-muted-foreground" /></div><p className="text-2xl font-bold mt-2">{statsQuery.data?.students ?? 0}</p></div>
            <div className="bg-card rounded-2xl border border-border p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Note</p><ClipboardList className="w-4 h-4 text-muted-foreground" /></div><p className="text-2xl font-bold mt-2">{statsQuery.data?.grades ?? 0}</p></div>
            <div className="bg-card rounded-2xl border border-border p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Prezențe</p><ClipboardList className="w-4 h-4 text-muted-foreground" /></div><p className="text-2xl font-bold mt-2">{statsQuery.data?.attendance ?? 0}</p></div>
            <div className="bg-card rounded-2xl border border-border p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Evenimente</p><CalendarDays className="w-4 h-4 text-muted-foreground" /></div><p className="text-2xl font-bold mt-2">{statsQuery.data?.events ?? 0}</p></div>
          </div>

          {isGlobalAdmin && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Școli (catalog multi-tenant)</h2>
                </div>
              </div>
              <div className="p-6">
                {schoolsQuery.isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="lg" className="text-primary" />
                  </div>
                )}
                {schoolsQuery.isError && (
                  <p className="text-sm text-destructive">Eroare la încărcarea școlilor.</p>
                )}
                {schoolsQuery.isSuccess && (!schoolsQuery.data?.length) && (
                  <EmptyState
                    title="Nicio școală"
                    description="Nu există școli încă în sistem."
                  />
                )}
                {schoolsQuery.isSuccess && schoolsQuery.data && schoolsQuery.data.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-secondary/50">
                        <tr>
                          <th className="text-left px-4 py-2 text-sm font-semibold text-muted-foreground">Școală</th>
                          <th className="text-left px-4 py-2 text-sm font-semibold text-muted-foreground">Cod</th>
                          <th className="text-right px-4 py-2 text-sm font-semibold text-muted-foreground">Utilizatori</th>
                          <th className="text-right px-4 py-2 text-sm font-semibold text-muted-foreground">Clase</th>
                          <th className="text-right px-4 py-2 text-sm font-semibold text-muted-foreground">Elevi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {schoolsQuery.data.map((s) => (
                          <tr key={s.id} className="hover:bg-secondary/30">
                            <td className="px-4 py-3 font-medium">{s.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{s.code ?? "—"}</td>
                            <td className="px-4 py-3 text-right">{s.user_count}</td>
                            <td className="px-4 py-3 text-right">{s.class_count}</td>
                            <td className="px-4 py-3 text-right">{s.student_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          <AlertDialog open={!!removeRoleConfirm} onOpenChange={(o) => !o && setRemoveRoleConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmare ștergere rol</AlertDialogTitle>
                <AlertDialogDescription>
                  Sigur doriți să ștergeți rolul {removeRoleConfirm?.role} pentru {removeRoleConfirm?.userName}? Această acțiune poate limita accesul utilizatorului.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anulare</AlertDialogCancel>
                <AlertDialogAction onClick={removeRole} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Șterge rol
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {isGlobalAdmin && (
            <div className="space-y-6">
              <SchoolOnboardingWizard />
              <BillingSection />
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Utilizatori & roluri</h2>
                <p className="text-sm text-muted-foreground">Acțiunile depind de politicile RLS (director/uat_admin).</p>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Tu: {currentUser?.roles?.join(', ') ?? '—'}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-muted-foreground">Nume</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-muted-foreground">Email</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-muted-foreground">Roluri</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(usersQuery.data ?? []).map(u => (
                    <tr key={u.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4 font-medium">{u.full_name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {u.roles.length ? u.roles.map(r => (
                            <span key={r} className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs">
                              {r}
                              <button className="hover:text-destructive" title="Șterge rol" onClick={() => confirmRemoveRole(u.id, r, u.full_name)}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </span>
                          )) : <span className="text-sm text-muted-foreground">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
