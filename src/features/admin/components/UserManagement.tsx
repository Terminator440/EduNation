import { useState, useEffect, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import { fetchUsers, inviteUser, removeUserRole, addUserRole, type UserWithRoles } from "../services/user-management.service";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuditLog, AUDIT_ACTIONS } from "@/hooks/useAuditLog";

interface UserManagementProps {
  isActive?: boolean;
}

const UserManagementBase = ({ isActive = true }: UserManagementProps) => {
  const { user: currentUser, profile } = useAuth();
  const queryClient = useQueryClient();
  const { logAction } = useAuditLog();
  
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    phone: "",
    role: "teacher" as "teacher" | "student" | "parent",
    class_id: "",
    student_id: "",
  });

  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; full_name: string }[]>([]);

  // Fetch classes for student/parent invitations - only when tab is active
  useEffect(() => {
    if (!isActive || !profile?.school_id) return;
    
    supabase
      .from("classes")
      .select("id, name, year, section")
      .eq("school_id", profile.school_id)
      .then(({ data }) => {
        setClasses(
          (data || []).map((c) => ({
            id: c.id,
            name: `${c.name} (${c.year}${c.section})`,
          }))
        );
      });
  }, [profile?.school_id, isActive]);

  // Fetch students when class is selected for parent invitation - only when tab is active
  useEffect(() => {
    if (!isActive) return;
    
    if (newUser.class_id && newUser.role === "parent") {
      supabase
        .from("students")
        .select("id, full_name")
        .eq("class_id", newUser.class_id)
        .then(({ data }) => {
          setStudents(data || []);
        });
    } else {
      setStudents([]);
    }
  }, [newUser.class_id, newUser.role, isActive]);

  const usersQuery = useQuery({
    queryKey: ["admin-users", page, pageSize, search],
    queryFn: () => fetchUsers(page, pageSize, search),
    enabled: isActive, // Only fetch when tab is active
  });

  const inviteMutation = useMutation({
    mutationFn: inviteUser,
    onSuccess: async (data) => {
      await logAction({
        action: AUDIT_ACTIONS.INVITATION_CREATE,
        entityType: "invitation",
        entityId: data.invitation_id,
        newData: { email: newUser.email, role: newUser.role },
      });

      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setInviteDialogOpen(false);
      setNewUser({
        email: "",
        full_name: "",
        phone: "",
        role: "teacher",
        class_id: "",
        student_id: "",
      });

      toast.success("Invitație creată", {
        description: `Codul de invitație: ${data.code}. Trimiteți-l utilizatorului prin email.`,
      });
    },
    onError: (error: Error) => {
      toast.error("Eroare", {
        description: error.message || "Nu s-a putut crea invitația.",
      });
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      removeUserRole(userId, role),
    onSuccess: async (_, variables) => {
      await logAction({
        action: AUDIT_ACTIONS.USER_ROLE_SWITCH,
        entityType: "user_role",
        entityId: variables.userId,
        oldData: { role: variables.role },
      });

      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Rol șters", {
        description: "Rolul a fost eliminat cu succes.",
      });
    },
    onError: (error: Error) => {
      toast.error("Eroare", {
        description: error.message || "Nu s-a putut șterge rolul.",
      });
    },
  });

  const addRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      addUserRole(userId, role),
    onSuccess: async (_, variables) => {
      await logAction({
        action: AUDIT_ACTIONS.USER_ROLE_SWITCH,
        entityType: "user_role",
        entityId: variables.userId,
        newData: { role: variables.role },
      });

      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Rol adăugat", {
        description: "Rolul a fost adăugat cu succes.",
      });
    },
    onError: (error: Error) => {
      toast.error("Eroare", {
        description: error.message || "Nu s-a putut adăuga rolul.",
      });
    },
  });

  const handleInvite = () => {
    if (!newUser.email || !newUser.full_name) {
      toast.error("Eroare", {
        description: "Completează email-ul și numele.",
      });
      return;
    }

    if ((newUser.role === "student" || newUser.role === "parent") && !newUser.class_id) {
      toast.error("Eroare", {
        description: "Selectează o clasă.",
      });
      return;
    }

    if (newUser.role === "parent" && !newUser.student_id) {
      toast.error("Eroare", {
        description: "Selectează un elev.",
      });
      return;
    }

    inviteMutation.mutate({
      email: newUser.email,
      full_name: newUser.full_name,
      phone: newUser.phone || null,
      role: newUser.role,
      class_id: newUser.class_id || null,
      student_id: newUser.student_id || null,
    });
  };

  const columns: DataTableColumn<UserWithRoles>[] = [
    {
      key: "full_name",
      header: "Nume",
      accessor: (r) => r.full_name,
    },
    {
      key: "email",
      header: "Email",
      accessor: (r) => r.email,
      render: (row) => (
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <span>{row.email}</span>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roluri",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.roles.length > 0 ? (
            row.roles.map((role) => (
              <span
                key={role}
                className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs"
              >
                {role}
                {row.id !== currentUser?.id && (
                  <button
                    className="hover:text-destructive"
                    title="Șterge rol"
                    onClick={() => removeRoleMutation.mutate({ userId: row.id, role })}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
          <Select
            onValueChange={(role) => addRoleMutation.mutate({ userId: row.id, role })}
          >
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue placeholder="Adaugă rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="teacher">Profesor</SelectItem>
              <SelectItem value="homeroom_teacher">Diriginte</SelectItem>
              <SelectItem value="student">Elev</SelectItem>
              <SelectItem value="parent">Părinte</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestionare Utilizatori</h2>
          <p className="text-sm text-muted-foreground">
            Gestionează utilizatorii școlii și rolurile acestora
          </p>
        </div>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Invită utilizator
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Invită utilizator nou</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="nume@example.com"
                />
              </div>
              <div>
                <Label>Nume complet *</Label>
                <Input
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="Ion Popescu"
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input
                  type="tel"
                  value={newUser.phone}
                  onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                  placeholder="0712345678"
                />
              </div>
              <div>
                <Label>Rol *</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value: "teacher" | "student" | "parent") =>
                    setNewUser({ ...newUser, role: value, class_id: "", student_id: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teacher">Profesor</SelectItem>
                    <SelectItem value="student">Elev</SelectItem>
                    <SelectItem value="parent">Părinte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(newUser.role === "student" || newUser.role === "parent") && (
                <div>
                  <Label>Clasă *</Label>
                  <Select
                    value={newUser.class_id}
                    onValueChange={(value) =>
                      setNewUser({ ...newUser, class_id: value, student_id: "" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selectează clasă" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {newUser.role === "parent" && newUser.class_id && (
                <div>
                  <Label>Elev *</Label>
                  <Select
                    value={newUser.student_id}
                    onValueChange={(value) => setNewUser({ ...newUser, student_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selectează elev" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name || "Fără nume"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                onClick={handleInvite}
                disabled={inviteMutation.isPending}
                className="w-full"
              >
                {inviteMutation.isPending ? "Se creează..." : "Creează invitație"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Caută după nume sau email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-sm"
        />
      </div>

      <DataTable
        data={usersQuery.data?.users || []}
        columns={columns}
        rowKey={(r) => r.id}
        loading={usersQuery.isLoading}
        emptyMessage="Nu există utilizatori."
        serverSidePagination={{
          total: usersQuery.data?.total || 0,
          page,
          pageSize,
          onPageChange: setPage,
        }}
      />

    </div>
  );
};

export const UserManagement = memo(UserManagementBase);
