import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { exportToCsv } from "@/utils/exportCsv";

type AuditRow = {
  id: string;
  created_at: string;
  user_name: string | null;
  active_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
};

const ALLOWED_ROLES = new Set(["director", "secretariat", "uat_admin", "developer", "homeroom_teacher"]);

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

export default function AuditLogs() {
  const { activeRole } = useAuth();
  const { toast } = useToast();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canView = useMemo(() => (activeRole ? ALLOWED_ROLES.has(activeRole) : false), [activeRole]);

  const fetchRows = async () => {
    if (!canView) return;

    setLoading(true);
    try {
      let query = supabase
        .from("audit_logs")
        .select("id, created_at, user_name, active_role, action, entity_type, entity_id, details")
        .order("created_at", { ascending: false })
        .limit(200);

      if (entityType.trim()) {
        query = query.eq("entity_type", entityType.trim());
      }

      if (dateFrom) {
        query = query.gte("created_at", new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        // include the entire day: add 1 day and use lt
        const end = new Date(dateTo);
        end.setDate(end.getDate() + 1);
        query = query.lt("created_at", end.toISOString());
      }

      // simple text search (best-effort)
      if (q.trim()) {
        const needle = q.trim();
        query = query.or(
          `user_name.ilike.%${needle}%,action.ilike.%${needle}%,entity_type.ilike.%${needle}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      setRows((data as any) ?? []);
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
    const exportRows = rows.map((r) => ({
      created_at: r.created_at,
      user_name: r.user_name ?? "",
      active_role: r.active_role ?? "",
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id ?? "",
      details: typeof r.details === "string" ? r.details : JSON.stringify(r.details ?? {}),
    }));

    exportToCsv(
      `edunation_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`,
      ["created_at", "user_name", "active_role", "action", "entity_type", "entity_id", "details"],
      exportRows
    );
  };

  if (!canView) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Nu ai acces la această secțiune. (Disponibil pentru Director/Secretariat/Admin.)
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="text-muted-foreground">
            Istoric pentru acțiuni importante (note, absențe, condică etc.). Folosește filtrele pentru a găsi rapid ce te interesează.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onExport} disabled={!rows.length}>
            Export CSV
          </Button>
          <Button onClick={fetchRows} disabled={loading}>
            {loading ? "Se încarcă..." : "Reîncarcă"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtre</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Căutare</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nume / acțiune / tip" />
          </div>
          <div className="space-y-2">
            <Label>Entity type</Label>
            <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="grades / attendance / teacher_register" />
          </div>
          <div className="space-y-2">
            <Label>De la</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Până la</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          <div className="md:col-span-4 flex gap-2">
            <Button variant="secondary" onClick={() => { setQ(""); setEntityType(""); setDateFrom(""); setDateTo(""); }}>
              Reset
            </Button>
            <Button onClick={fetchRows} disabled={loading}>
              Aplică filtre
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evenimente (max 200)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Utilizator</th>
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">Acțiune</th>
                  <th className="py-2 pr-4">Entity</th>
                  <th className="py-2 pr-4">ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4">{r.user_name ?? "—"}</td>
                    <td className="py-2 pr-4">{roleLabel(r.active_role)}</td>
                    <td className="py-2 pr-4">{r.action}</td>
                    <td className="py-2 pr-4">{r.entity_type}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.entity_id ?? "—"}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td className="py-6 text-muted-foreground" colSpan={6}>
                      Nu există înregistrări pentru filtrele curente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
