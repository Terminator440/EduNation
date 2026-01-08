import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { exportToCsv } from "@/utils/exportCsv";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Shield, Download, RefreshCw, Search, Filter, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";

type AuditRow = {
  id: string;
  created_at: string;
  user_name: string | null;
  active_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  old_data?: any;
  new_data?: any;
  school_id?: string | null;
};

const ALLOWED_ROLES = new Set([
  "director",
  "secretariat",
  "uat_admin",
  "developer",
  "homeroom_teacher",
]);

function roleLabel(role: string | null) {
  const labels: Record<string, string> = {
    student: "Elev",
    parent: "Părinte",
    teacher: "Profesor",
    homeroom_teacher: "Diriginte",
    secretariat: "Secretariat",
    director: "Director",
    uat_admin: "Admin UAT",
    developer: "Developer",
  };
  if (!role) return "—";
  return labels[role] ?? role;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "grade.create": "Notă adăugată",
    "grade.update": "Notă modificată",
    "grade.delete": "Notă ștearsă",
    "attendance.create": "Prezență înregistrată",
    "attendance.update": "Prezență modificată",
    "attendance.motivate": "Absență motivată",
    "invitation.create": "Invitație creată",
    "invitation.claim": "Invitație folosită",
    "invitation.revoke": "Invitație revocată",
    "student.create": "Elev adăugat",
    "student.update": "Elev modificat",
    "user.login": "Autentificare",
    "user.logout": "Deconectare",
    "error.frontend": "Eroare frontend",
  };
  return labels[action] ?? action;
}

function getActionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  if (action.includes("delete") || action.includes("revoke") || action.includes("error")) {
    return "destructive";
  }
  if (action.includes("create") || action.includes("claim")) {
    return "default";
  }
  if (action.includes("update") || action.includes("motivate")) {
    return "secondary";
  }
  return "outline";
}

export default function AuditLogs() {
  const { activeRole } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { toast } = useToast();

  const [allRows, setAllRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Detail dialog
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);

  const canView = useMemo(
    () => (activeRole ? ALLOWED_ROLES.has(activeRole) : false),
    [activeRole]
  );

  // Apply client-side filters
  const filteredRows = useMemo(() => {
    let result = allRows;

    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      result = result.filter(
        (r) =>
          (r.user_name ?? "").toLowerCase().includes(needle) ||
          r.action.toLowerCase().includes(needle) ||
          (r.entity_type ?? "").toLowerCase().includes(needle)
      );
    }

    if (entityType.trim()) {
      result = result.filter((r) => r.entity_type === entityType.trim());
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      result = result.filter((r) => new Date(r.created_at) >= fromDate);
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setDate(toDate.getDate() + 1);
      result = result.filter((r) => new Date(r.created_at) < toDate);
    }

    return result;
  }, [allRows, q, entityType, dateFrom, dateTo]);

  // Pagination
  const pagination = usePagination(filteredRows, { initialPageSize: 20 });

  const fetchRows = async () => {
    if (!canView) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, user_name, active_role, action, entity_type, entity_id, details, old_data, new_data, school_id")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setAllRows((data as AuditRow[]) ?? []);
    } catch (e: any) {
      toast({
        title: "Eroare",
        description: e?.message ?? "Nu am putut încărca audit log.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const onExport = () => {
    const exportRows = filteredRows.map((r) => ({
      created_at: r.created_at,
      user_name: r.user_name ?? "",
      active_role: r.active_role ?? "",
      action: r.action,
      entity_type: r.entity_type ?? "",
      entity_id: r.entity_id ?? "",
      details: typeof r.details === "string" ? r.details : JSON.stringify(r.details ?? {}),
    }));

    exportToCsv(
      `edunation_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`,
      ["created_at", "user_name", "active_role", "action", "entity_type", "entity_id", "details"],
      exportRows
    );

    toast({ title: "Export realizat", description: `${exportRows.length} înregistrări exportate.` });
  };

  const resetFilters = () => {
    setQ("");
    setEntityType("");
    setDateFrom("");
    setDateTo("");
  };

  if (!canView) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className={cn(
          "transition-all duration-300 p-6",
          sidebarCollapsed ? "ml-20" : "ml-64"
        )}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Audit log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Nu ai acces la această secțiune. (Disponibil pentru Director/Secretariat/Admin/Diriginte.)
              </p>
            </CardContent>
          </Card>
        </main>
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
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6" />
                Audit log
              </h1>
              <p className="text-muted-foreground">
                Istoric pentru acțiuni importante (note, absențe, invitații etc.).
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onExport}
                disabled={!filteredRows.length}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
              <Button onClick={fetchRows} disabled={loading} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Se încarcă..." : "Reîncarcă"}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="w-4 h-4" />
                Filtre
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Căutare</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="nume / acțiune / tip"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tip entitate</Label>
                <Input
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  placeholder="grades / attendance / invitation"
                />
              </div>
              <div className="space-y-2">
                <Label>De la</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Până la</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={resetFilters} className="w-full">
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Evenimente ({filteredRows.length} înregistrări)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-3 pr-4 font-medium">Data</th>
                      <th className="py-3 pr-4 font-medium">Utilizator</th>
                      <th className="py-3 pr-4 font-medium">Rol</th>
                      <th className="py-3 pr-4 font-medium">Acțiune</th>
                      <th className="py-3 pr-4 font-medium">Entitate</th>
                      <th className="py-3 pr-4 font-medium">ID</th>
                      <th className="py-3 font-medium w-[80px]">Detalii</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.paginatedData.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/50">
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString("ro-RO")}
                        </td>
                        <td className="py-3 pr-4">{r.user_name ?? "—"}</td>
                        <td className="py-3 pr-4">
                          <Badge variant="outline">{roleLabel(r.active_role)}</Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={getActionBadgeVariant(r.action)}>
                            {actionLabel(r.action)}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {r.entity_type ?? "—"}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                          {r.entity_id ? r.entity_id.slice(0, 8) + "..." : "—"}
                        </td>
                        <td className="py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedRow(r)}
                            className="gap-1"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!pagination.paginatedData.length && (
                      <tr>
                        <td className="py-8 text-center text-muted-foreground" colSpan={7}>
                          Nu există înregistrări pentru filtrele curente.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <PaginationControls
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  pageSize={pagination.pageSize}
                  onPageChange={pagination.goToPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            </CardContent>
          </Card>

          {/* Detail Dialog */}
          <Dialog open={!!selectedRow} onOpenChange={() => setSelectedRow(null)}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Detalii Audit</DialogTitle>
              </DialogHeader>
              {selectedRow && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Data</p>
                      <p className="font-medium">
                        {new Date(selectedRow.created_at).toLocaleString("ro-RO")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Utilizator</p>
                      <p className="font-medium">{selectedRow.user_name ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Rol</p>
                      <p className="font-medium">{roleLabel(selectedRow.active_role)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Acțiune</p>
                      <Badge variant={getActionBadgeVariant(selectedRow.action)}>
                        {actionLabel(selectedRow.action)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tip entitate</p>
                      <p className="font-medium">{selectedRow.entity_type ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">ID entitate</p>
                      <p className="font-mono text-xs">{selectedRow.entity_id ?? "—"}</p>
                    </div>
                  </div>

                  {selectedRow.old_data && (
                    <div>
                      <p className="text-muted-foreground mb-2">Date vechi</p>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40">
                        {JSON.stringify(selectedRow.old_data, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedRow.new_data && (
                    <div>
                      <p className="text-muted-foreground mb-2">Date noi</p>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40">
                        {JSON.stringify(selectedRow.new_data, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedRow.details && (
                    <div>
                      <p className="text-muted-foreground mb-2">Detalii suplimentare</p>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40">
                        {JSON.stringify(selectedRow.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}
