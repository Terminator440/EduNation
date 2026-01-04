import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Shield, Bell, Database, KeyRound } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type HealthLevel = "ok" | "warn" | "error";

type HealthCheck = {
  id: string;
  title: string;
  description: string;
  level: HealthLevel;
  detail?: string;
};

const levelToUi = (level: HealthLevel) => {
  switch (level) {
    case "ok":
      return { icon: CheckCircle2, badge: "OK", badgeVariant: "default" as const };
    case "warn":
      return { icon: AlertTriangle, badge: "Atenție", badgeVariant: "secondary" as const };
    case "error":
      return { icon: XCircle, badge: "Eroare", badgeVariant: "destructive" as const };
  }
};

export default function Developer() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, activeRole, userRoles } = useAuth();

  const [checks, setChecks] = useState<HealthCheck[]>([
    {
      id: "env",
      title: "Config (ENV)",
      description: "Verifică variabilele necesare pentru conectarea la Supabase.",
      level: "warn",
    },
    {
      id: "auth",
      title: "Autentificare",
      description: "Confirmă că sesiunea este validă și disponibilă.",
      level: "warn",
    },
    {
      id: "db",
      title: "Bază de date",
      description: "Rulează un query simplu (poate fi limitat de RLS).",
      level: "warn",
    },
    {
      id: "notifications",
      title: "Notificări browser",
      description: "Verifică permisiunea de notificări și oferă un buton de cerere.",
      level: "warn",
    },
  ]);

  const roleBadge = useMemo(() => {
    const label = activeRole ?? "(necunoscut)";
    return label;
  }, [activeRole]);

  const isDeveloper = activeRole === "developer";

  const updateCheck = (id: string, patch: Partial<HealthCheck>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  useEffect(() => {
    // ENV check - use VITE_SUPABASE_PUBLISHABLE_KEY (correct name for Lovable Cloud)
    const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
    const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
    if (url && publishableKey) {
      updateCheck("env", { level: "ok", detail: "VITE_SUPABASE_URL și VITE_SUPABASE_PUBLISHABLE_KEY sunt setate." });
    } else {
      const missing: string[] = [];
      if (!url) missing.push("VITE_SUPABASE_URL");
      if (!publishableKey) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
      updateCheck("env", {
        level: "error",
        detail: `Lipsesc: ${missing.join(", ")}. Verifică fișierul .env și rebuild.`,
      });
    }

    // Notifications
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        const perm = Notification.permission;
        if (perm === "granted") {
          updateCheck("notifications", { level: "ok", detail: "Permisiunea este acordată." });
        } else if (perm === "denied") {
          updateCheck("notifications", {
            level: "warn",
            detail: "Permisiunea este blocată în browser. Trebuie deblocată manual din setări.",
          });
        } else {
          updateCheck("notifications", { level: "warn", detail: "Permisiunea nu a fost cerută încă." });
        }
      } else {
        updateCheck("notifications", { level: "warn", detail: "Browserul nu suportă Notification API." });
      }
    } catch {
      updateCheck("notifications", { level: "warn", detail: "Nu pot verifica permisiunile în acest context." });
    }

    // Auth + DB checks (async)
    (async () => {
      try {
        const { data: sessionRes, error } = await supabase.auth.getSession();
        if (error) {
          updateCheck("auth", { level: "error", detail: `Auth error: ${error.message}` });
        } else if (sessionRes.session) {
          updateCheck("auth", { level: "ok", detail: "Sesiune activă detectată." });
        } else {
          updateCheck("auth", { level: "warn", detail: "Nu există sesiune activă (neautentificat)." });
        }
      } catch (e: any) {
        updateCheck("auth", { level: "error", detail: `Auth exception: ${e?.message ?? String(e)}` });
      }

      // DB check: keep it non-destructive. RLS blocks should be treated as warning.
      try {
        const { error } = await supabase.from("profiles").select("id").limit(1);
        if (!error) {
          updateCheck("db", { level: "ok", detail: "Query simplu pe profiles a rulat." });
        } else {
          // Common: RLS denies select
          updateCheck("db", {
            level: "warn",
            detail: `Query blocat sau eșuat (posibil RLS). Mesaj: ${error.message}`,
          });
        }
      } catch (e: any) {
        updateCheck("db", { level: "error", detail: `DB exception: ${e?.message ?? String(e)}` });
      }
    })();
  }, []);

  const requestNotifications = async () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          updateCheck("notifications", { level: "ok", detail: "Permisiunea este acordată." });
        } else if (perm === "denied") {
          updateCheck("notifications", { level: "warn", detail: "Permisiunea a fost refuzată." });
        } else {
          updateCheck("notifications", { level: "warn", detail: "Permisiunea a rămas în stare implicită." });
        }
      }
    } catch {
      updateCheck("notifications", { level: "warn", detail: "Cererea de permisiune a eșuat." });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "ml-20" : "ml-64"
        )}
      >
        <div className="p-6 max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <h1 className="text-2xl font-bold">Developer · Diagnostic sistem</h1>
              </div>
              <p className="text-muted-foreground mt-1">
                Pagina internă pentru verificări rapide (ENV, Auth, DB, notificări). Nu este destinată utilizatorilor finali.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className="px-3 py-1">
                Rol detectat: <span className="ml-1 font-semibold">{roleBadge}</span>
              </Badge>
              <Badge variant="secondary" className="px-3 py-1">
                {user?.email ?? "(fără email)"}
              </Badge>
            </div>
          </div>

          {!isDeveloper && (
            <Alert className="mb-6" variant="destructive">
              <AlertTitle>Acces în mod non-developer</AlertTitle>
              <AlertDescription>
                Contul curent nu are rolul <strong>developer</strong>. Pagina poate fi folosită pentru diagnostic, dar dacă vrei acces complet,
                setează rolul în Supabase (tabelul <code>user_roles</code> sau <code>profiles</code>, în funcție de schema ta).
                <div className="mt-2 text-sm opacity-90">
                  Roluri detectate: <strong>{userRoles.length ? userRoles.join(", ") : "(niciun rol)"}</strong>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {checks.map((c) => {
              const ui = levelToUi(c.level);
              const Icon = ui.icon;
              const extraIcon =
                c.id === "auth" ? KeyRound : c.id === "db" ? Database : c.id === "notifications" ? Bell : Shield;
              const Extra = extraIcon;

              return (
                <Card key={c.id} className="overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                        <Extra className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{c.title}</CardTitle>
                        <div className="text-sm text-muted-foreground">{c.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ui.badgeVariant}>{ui.badge}</Badge>
                      <Icon className="w-5 h-5" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {c.detail ? (
                      <div className="text-sm leading-relaxed">{c.detail}</div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Verificare în curs…</div>
                    )}

                    {c.id === "notifications" && typeof window !== "undefined" && "Notification" in window && (
                      <div className="mt-3">
                        <Button size="sm" variant="outline" onClick={requestNotifications}>
                          Cere permisiune
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
