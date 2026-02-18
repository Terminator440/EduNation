import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { exportToCsv } from "@/utils/exportCsv";
import { Shield, Download, RefreshCw, Search, Filter, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

type AuditRow = {
  id: string;
  created_at: string;
  user_name: string | null;
  active_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
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

const AuditLogsBase = () => {
  const { activeRole } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { toast } = useToast();

  const onToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

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

  // Virtualizare: doar rândurile vizibile sunt în DOM
  const scrollRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 52;
  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

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
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Nu am putut încărca audit log.";
      toast({
        title: "Eroare",
        description: errorMessage,
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
      <div className="min-h-screen w-full bg-background max-w-full overflow-x-hidden">
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
        <main className={cn(
          "w-full min-w-0 transition-all duration-300 pt-14 md:pt-0",
          sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64"
        )}>
          <div className="w-full max-w-screen-xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-full overflow-x-hidden">
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
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background max-w-full overflow-x-hidden">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
      <main className={cn(
        "w-full min-w-0 max-w-full overflow-x-hidden transition-all duration-300 will-change-transform pt-14 md:pt-0",
        sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64"
      )}>
        <div className="w-full max-w-screen-xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6">
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

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={onExport}
                disabled={!filteredRows.length}
                className="gap-2 w-full sm:w-auto"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
              <Button onClick={fetchRows} disabled={loading} className="gap-2 w-full sm:w-auto">
                {loading ? <Spinner size="sm" className="w-4 h-4 text-current" /> : <RefreshCw className="w-4 h-4" />}
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
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Căutare</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="nume / acțiune / tip"
                    className="pl-9 w-full"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tip entitate</Label>
                <Input
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  placeholder="grades / attendance / invitation"
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>De la</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Până la</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={resetFilters} className="w-full">
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tabel virtualizat — doar rândurile vizibile sunt în DOM */}
          <Card className="content-visibility-auto">
            <CardHeader>
              <CardTitle className="text-base">
                {loading ? (
                  <Skeleton className="h-5 w-48" />
                ) : (
                  `Evenimente (${filteredRows.length} înregistrări)`
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <div className="w-full border border-border rounded-lg overflow-hidden">
                {/* Header fix — același grid ca rândurile */}
                <div
                  className="grid text-left border-b bg-muted/40 text-sm font-medium shrink-0"
                  style={{
                    gridTemplateColumns: "5rem 1fr 4.5rem 1fr 4.5rem 3.5rem 3rem",
                  }}
                  role="row"
                >
                  <div className="py-3 pr-2 sm:pr-4 whitespace-nowrap">Data</div>
                  <div className="py-3 pr-2 sm:pr-4 whitespace-nowrap min-w-0">Utilizator</div>
                  <div className="hidden sm:block py-3 pr-4 whitespace-nowrap">Rol</div>
                  <div className="py-3 pr-2 sm:pr-4 whitespace-nowrap min-w-0">Acțiune</div>
                  <div className="hidden md:block py-3 pr-4 whitespace-nowrap">Entitate</div>
                  <div className="hidden lg:block py-3 pr-4 whitespace-nowrap">ID</div>
                  <div className="py-3 whitespace-nowrap w-12">Detalii</div>
                </div>

                {/* Corp virtualizat */}
                <div
                  ref={scrollRef}
                  className="w-full overflow-auto overscroll-contain"
                  style={{ minHeight: 320, maxHeight: "60vh" }}
                  role="table"
                  aria-rowcount={filteredRows.length}
                >
                  {loading ? (
                    // Skeleton rows that mimic the table structure
                    <div className="space-y-0">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="grid border-b last:border-b-0 items-center py-3"
                          style={{
                            gridTemplateColumns: "5rem 1fr 4.5rem 1fr 4.5rem 3.5rem 3rem",
                          }}
                        >
                          <div className="px-2 sm:px-4">
                            <Skeleton className="h-4 w-20" />
                          </div>
                          <div className="px-2 sm:px-4">
                            <Skeleton className="h-4 w-32" />
                          </div>
                          <div className="hidden sm:block px-4">
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                          <div className="px-2 sm:px-4">
                            <Skeleton className="h-5 w-24 rounded-full" />
                          </div>
                          <div className="hidden md:block px-4">
                            <Skeleton className="h-4 w-20" />
                          </div>
                          <div className="hidden lg:block px-4">
                            <Skeleton className="h-4 w-16" />
                          </div>
                          <div className="px-3">
                            <Skeleton className="h-8 w-8 rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredRows.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      Nu există înregistrări pentru filtrele curente.
                    </div>
                  ) : (
                    <div
                      style={{
                        height: totalSize,
                        width: "100%",
                        position: "relative",
                      }}
                    >
                      {virtualItems.map((virtualRow) => {
                        const r = filteredRows[virtualRow.index];
                        return (
                          <div
                            key={r.id}
                            data-index={virtualRow.index}
                            className="grid absolute left-0 w-full text-sm border-b last:border-b-0 hover:bg-muted/50 items-center"
                            style={{
                              gridTemplateColumns: "5rem 1fr 4.5rem 1fr 4.5rem 3.5rem 3rem",
                              transform: `translateY(${virtualRow.start}px)`,
                              minHeight: ROW_HEIGHT,
                            }}
                            role="row"
                          >
                            <div className="py-3 pr-2 sm:pr-4 whitespace-nowrap text-xs sm:text-sm">
                              {new Date(r.created_at).toLocaleString("ro-RO")}
                            </div>
                            <div className="py-3 pr-2 sm:pr-4 truncate min-w-0">{r.user_name ?? "—"}</div>
                            <div className="hidden sm:flex py-3 pr-4 items-center">
                              <Badge variant="outline">{roleLabel(r.active_role)}</Badge>
                            </div>
                            <div className="py-3 pr-2 sm:pr-4 min-w-0">
                              <Badge variant={getActionBadgeVariant(r.action)}>
                                {actionLabel(r.action)}
                              </Badge>
                            </div>
                            <div className="hidden md:block py-3 pr-4 text-muted-foreground">
                              {r.entity_type ?? "—"}
                            </div>
                            <div className="hidden lg:block py-3 pr-4 font-mono text-xs text-muted-foreground">
                              {r.entity_id ? r.entity_id.slice(0, 8) + "..." : "—"}
                            </div>
                            <div className="py-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedRow(r)}
                                className="gap-1 h-8 w-8 p-0"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                  <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
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
};

const AuditLogs = memo(AuditLogsBase);
export default AuditLogs;
