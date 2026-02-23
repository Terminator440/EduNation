import { useMemo, useState, useCallback } from "react";
import { Shield, Users, GraduationCap, ClipboardList, CalendarDays, Plus, Trash2, Building2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { fetchSchoolsForGlobalAdmin } from "@/features/admin/services/global-admin.service";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/spinner";

type AppRoleEnum = Database["public"]["Enums"]["app_role"];
type Role = Exclude<AppRoleEnum, "developer">; // Exclude developer from admin assignable roles

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];

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
      const [profiles, classes, students, grades, attendance] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('classes').select('id', { count: 'exact', head: true }),
        supabase.from('students').select('id', { count: 'exact', head: true }),
        supabase.from('grades').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      ]);
      return {
        profiles: profiles.count ?? 0,
        classes: classes.count ?? 0,
        students: students.count ?? 0,
        grades: grades.count ?? 0,
        attendance: attendance.count ?? 0,
        events: 0,
      };
    },
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<UserRow[]> => {
      const pRes = await supabase.from('profiles').select('id,full_name,email').order('full_name', { ascending: true });
      const profiles = assertSupabaseOk(pRes, 'profiles.select(admin)') as ProfileRow[];

      const rRes = await supabase.from('user_roles').select('user_id,role');
      const roles = assertSupabaseOk(rRes, 'user_roles.select(admin)') as UserRoleRow[];

      const roleMap = new Map<string, Role[]>();
      for (const r of roles) {
        const arr = roleMap.get(r.user_id) ?? [];
        const role = r.role as Role;
        if (role !== "developer") {
          arr.push(role);
          roleMap.set(r.user_id, arr);
        }
      }

      return (profiles || []).map(p => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        roles: (roleMap.get(p.id) ?? []) as Role[],
      }));
    },
  });

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<Role>('teacher');

  const assignRole = async () => {
    if (!selectedUserId) return;
    const { error } = await supabase.from('user_roles').insert({ user_id: selectedUserId, role: selectedRole });
    if (error) {
      toast({ title: 'Eroare', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'OK', description: 'Rol adăugat.' });
    await usersQuery.refetch();
  };

  const removeRole = async (userId: string, role: Role) => {
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role);
    if (error) {
      toast({ title: 'Eroare', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'OK', description: 'Rol șters.' });
    await usersQuery.refetch();
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
                              <button className="hover:text-destructive" title="Șterge rol" onClick={() => removeRole(u.id, r)}>
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
