import { useEffect, useMemo, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Shield, Bell, Database, KeyRound, GraduationCap, UserCircle, Calendar, Megaphone, Info } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
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

type CanaryCheck = {
  id: string;
  table: string;
  title: string;
  level: HealthLevel;
  detail?: string;
};

const levelToUi = (level: HealthLevel) => {
  switch (level) {
    case "ok":
      return { icon: CheckCircle2, badge: "OK", badgeVariant: "default" as const, color: "text-green-500" };
    case "warn":
      return { icon: AlertTriangle, badge: "Atenție", badgeVariant: "secondary" as const, color: "text-amber-500" };
    case "error":
      return { icon: XCircle, badge: "Eroare", badgeVariant: "destructive" as const, color: "text-red-500" };
  }
};

export default function Developer() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const onToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);
  const { user, activeRole, userRoles } = useAuth();

  const [checks, setChecks] = useState<HealthCheck[]>([
    {
      id: "env",
      title: "Config (ENV)",
      description: "Verifică variabilele necesare pentru conectarea la backend.",
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
  ]);

  const [canaryChecks, setCanaryChecks] = useState<CanaryCheck[]>([
    { id: "grades", table: "grades", title: "Tabela: grades", level: "warn" },
    { id: "attendance", table: "attendance", title: "Tabela: attendance", level: "warn" },
    { id: "announcements", table: "announcements", title: "Tabela: announcements", level: "warn" },
    { id: "audit_logs", table: "audit_logs", title: "Tabela: audit_logs", level: "warn" },
    { id: "classes", table: "classes", title: "Tabela: classes", level: "warn" },
    { id: "students", table: "students", title: "Tabela: students", level: "warn" },
    { id: "timetable_entries", table: "timetable_entries", title: "Tabela: timetable_entries", level: "warn" },
    { id: "school_events", table: "school_events", title: "Tabela: school_events", level: "warn" },
  ]);

  const [notifStatus, setNotifStatus] = useState<{
    permission: NotificationPermission | "unsupported";
    detail: string;
  }>({ permission: "unsupported", detail: "Verificare în curs..." });

  const roleBadge = useMemo(() => {
    const label = activeRole ?? "(necunoscut)";
    return label;
  }, [activeRole]);

  const isDeveloper = activeRole === "developer";

  const updateCheck = (id: string, patch: Partial<HealthCheck>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const updateCanary = (id: string, patch: Partial<CanaryCheck>) => {
    setCanaryChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  useEffect(() => {
    // ENV check
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
        detail: `Lipsesc: ${missing.join(", ")}. Verifică configurarea.`,
      });
    }

    // Browser notifications check
    checkBrowserNotifications();

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
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        updateCheck("auth", { level: "error", detail: `Auth exception: ${errorMessage}` });
      }

      // DB check
      try {
        const { error } = await supabase.from("profiles").select("id").limit(1);
        if (!error) {
          updateCheck("db", { level: "ok", detail: "Query simplu pe profiles a rulat." });
        } else {
          updateCheck("db", {
            level: "warn",
            detail: `Query blocat sau eșuat (posibil RLS). Mesaj: ${error.message}`,
          });
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        updateCheck("db", { level: "error", detail: `DB exception: ${errorMessage}` });
      }

      // Canary checks for each module
      await runCanaryChecks();
    })();
  }, []);

  const checkBrowserNotifications = () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        const perm = Notification.permission;
        if (perm === "granted") {
          setNotifStatus({
            permission: "granted",
            detail: "Permisiunea pentru notificări push browser este ACORDATĂ. Poți primi notificări push.",
          });
        } else if (perm === "denied") {
          setNotifStatus({
            permission: "denied",
            detail: "Permisiunea pentru notificări push browser este BLOCATĂ. Pentru a o activa, mergi în setările browserului → Site settings → Notifications → Allow pentru acest site.",
          });
        } else {
          setNotifStatus({
            permission: "default",
            detail: "Permisiunea pentru notificări push browser nu a fost cerută încă. Apasă butonul de mai jos pentru a o solicita.",
          });
        }
      } else {
        setNotifStatus({
          permission: "unsupported",
          detail: "Browserul nu suportă Notification API sau context-ul este restricționat (iframe sandbox).",
        });
      }
    } catch {
      setNotifStatus({
        permission: "unsupported",
        detail: "Nu pot verifica permisiunile în acest context.",
      });
    }
  };

  const runCanaryChecks = async () => {
    const tableConfigs: { id: string; table: "grades" | "attendance" | "announcements" | "audit_logs" | "classes" | "students" | "timetable_entries" | "school_events" }[] = [
      { id: "grades", table: "grades" },
      { id: "attendance", table: "attendance" },
      { id: "announcements", table: "announcements" },
      { id: "audit_logs", table: "audit_logs" },
      { id: "classes", table: "classes" },
      { id: "students", table: "students" },
      { id: "timetable_entries", table: "timetable_entries" },
      { id: "school_events", table: "school_events" },
    ];
    
    for (const { id, table } of tableConfigs) {
      try {
        const { data, error } = await supabase.from(table).select("id").limit(1);
        if (!error) {
          updateCanary(id, {
            level: "ok",
            detail: `Schema OK. ${data?.length ?? 0} rând(uri) returnate (limitat de RLS).`,
          });
        } else {
          if (error.code === "42P01") {
            // Table doesn't exist
            updateCanary(id, {
              level: "error",
              detail: `Tabela "${table}" nu există în baza de date.`,
            });
          } else if (error.code === "42501" || error.message.includes("permission denied")) {
            updateCanary(id, {
              level: "warn",
              detail: `RLS denied (policy missing/too strict). Mesaj: ${error.message}`,
            });
          } else {
            updateCanary(id, {
              level: "warn",
              detail: `Query eșuat: ${error.message}`,
            });
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        updateCanary(id, {
          level: "error",
          detail: `Excepție: ${errorMessage}`,
        });
      }
    }
  };

  const requestNotifications = async () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        await Notification.requestPermission();
        checkBrowserNotifications();
      }
    } catch {
      setNotifStatus({
        permission: "unsupported",
        detail: "Cererea de permisiune a eșuat.",
      });
    }
  };

  const canaryIcon = (id: string) => {
    switch (id) {
      case "grades": return GraduationCap;
      case "attendance": return UserCircle;
      case "announcements": return Megaphone;
      case "audit_logs": return Shield;
      case "classes": return Database;
      case "students": return UserCircle;
      case "timetable_entries": return Calendar;
      case "school_events": return Calendar;
      default: return Database;
    }
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
      <main
        className={cn(
          "w-full min-w-0 transition-all duration-300 will-change-transform",
          "pt-14 md:pt-0", sidebarCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64"
        )}
      >
        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <h1 className="text-2xl font-bold">Developer · Diagnostic sistem</h1>
              </div>
              <p className="text-muted-foreground mt-1">
                Pagina internă pentru verificări rapide (ENV, Auth, DB, RLS canary checks). Nu este destinată utilizatorilor finali.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className="px-3 py-1">
                Rol detectat: <span className="ml-1 font-semibold">{roleBadge}</span>
              </Badge>
              <Badge variant="secondary" className="px-3 py-1">
                {user?.email ?? "(fără email)"}
              </Badge>
              <Badge variant="outline" className="px-3 py-1 text-xs">
                Roluri din DB: {userRoles.length ? userRoles.join(", ") : "(niciun rol)"}
              </Badge>
            </div>
          </div>

          {!isDeveloper && (
            <Alert className="mb-6" variant="destructive">
              <AlertTitle>Acces în mod non-developer</AlertTitle>
              <AlertDescription>
                Contul curent nu are rolul <strong>developer</strong>. Această pagină ar trebui să fie accesibilă doar pentru developeri.
              </AlertDescription>
            </Alert>
          )}

          {/* System Health Checks */}
          <h2 className="text-lg font-semibold mb-4">Verificări Sistem</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-8">
            {checks.map((c) => {
              const ui = levelToUi(c.level);
              const Icon = ui.icon;
              const extraIcon =
                c.id === "auth" ? KeyRound : c.id === "db" ? Database : Shield;
              const Extra = extraIcon;

              return (
                <Card key={c.id} className="overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                        <Extra className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{c.title}</CardTitle>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ui.badgeVariant}>{ui.badge}</Badge>
                      <Icon className={cn("w-5 h-5", ui.color)} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">{c.description}</p>
                    {c.detail ? (
                      <div className="text-sm leading-relaxed">{c.detail}</div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Verificare în curs…</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Separator className="my-6" />

          {/* RLS Canary Checks */}
          <h2 className="text-lg font-semibold mb-4">Canary Checks (RLS per modul)</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Acestea verifică dacă tabelele principale există și dacă politicile RLS permit cel puțin citirea datelor. "RLS denied" înseamnă că politicile sunt prea stricte sau lipsesc.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {canaryChecks.map((c) => {
              const ui = levelToUi(c.level);
              const Icon = ui.icon;
              const TableIcon = canaryIcon(c.id);

              return (
                <Card key={c.id} className="overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                        <TableIcon className="w-4 h-4" />
                      </div>
                      <CardTitle className="text-sm">{c.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ui.badgeVariant} className="text-xs">{ui.badge}</Badge>
                      <Icon className={cn("w-4 h-4", ui.color)} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {c.detail ? (
                      <div className="text-xs leading-relaxed">{c.detail}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Verificare în curs…</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Separator className="my-6" />

          {/* Notifications Section */}
          <h2 className="text-lg font-semibold mb-4">Notificări</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-8">
            {/* In-App Notifications */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Notificări In-App</CardTitle>
                    <CardDescription>Notificări în aplicație (must-have)</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">Activ</Badge>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Notificările in-app sunt funcționale. Utilizatorii primesc notificări pentru note noi, absențe, anunțuri etc. direct în aplicație, accesibile din meniul „Notificări".
                </p>
              </CardContent>
            </Card>

            {/* Browser Push Notifications */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Notificări Push Browser</CardTitle>
                    <CardDescription>Notificări native browser (opțional)</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  {notifStatus.permission === "granted" && (
                    <>
                      <Badge variant="default">Granted</Badge>
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </>
                  )}
                  {notifStatus.permission === "denied" && (
                    <>
                      <Badge variant="destructive">Denied</Badge>
                      <XCircle className="w-4 h-4 text-red-500" />
                    </>
                  )}
                  {notifStatus.permission === "default" && (
                    <>
                      <Badge variant="secondary">Default</Badge>
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    </>
                  )}
                  {notifStatus.permission === "unsupported" && (
                    <>
                      <Badge variant="outline">Unsupported</Badge>
                      <Info className="w-4 h-4 text-muted-foreground" />
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {notifStatus.detail}
                </p>
                {notifStatus.permission === "default" && (
                  <Button size="sm" variant="outline" onClick={requestNotifications}>
                    Cere permisiune
                  </Button>
                )}
                {notifStatus.permission === "denied" && (
                  <Alert className="mt-2">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Pentru a debloca: Chrome → Settings → Privacy and security → Site Settings → Notifications → găsește acest site și schimbă la „Allow".
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          <Separator className="my-6" />

          {/* Quick Actions */}
          <h2 className="text-lg font-semibold mb-4">Acțiuni rapide</h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reîncarcă pagina
            </Button>
            <Button variant="outline" onClick={runCanaryChecks}>
              Re-rulează canary checks
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
