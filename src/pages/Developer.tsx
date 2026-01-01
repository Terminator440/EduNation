import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Bug,
  CheckCircle,
  Database,
  GlobeLock,
  KeyRound,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";

import Sidebar from "@/components/dashboard/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

type HealthStatus = "pending" | "ok" | "warning" | "error";

type HealthCheck = {
  id: string;
  title: string;
  description: string;
  icon: any;
  status: HealthStatus;
  detail?: string;
};

const statusMeta: Record<HealthStatus, { label: string; icon: any; className: string }> = {
  pending: { label: "Verific…", icon: RefreshCw, className: "text-muted-foreground" },
  ok: { label: "OK", icon: CheckCircle, className: "text-emerald-600" },
  warning: { label: "Atenție", icon: AlertTriangle, className: "text-amber-600" },
  error: { label: "Eroare", icon: XCircle, className: "text-destructive" },
};

const mask = (value: string, visibleEnd = 4) => {
  if (!value) return "—";
  if (value.length <= visibleEnd) return "••••";
  return `${"•".repeat(Math.max(6, value.length - visibleEnd))}${value.slice(-visibleEnd)}`;
};

const Developer = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, session, profile, activeRole } = useAuth();
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [running, setRunning] = useState(false);

  const meta = useMemo(() => {
    const url = env.VITE_SUPABASE_URL ?? "";
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
    return {
      supabaseUrl: url || "(lipsește)",
      supabaseKeyMasked: key ? mask(key, 6) : "(lipsește)",
    };
  }, []);

  const runChecks = async () => {
    setRunning(true);
    const initial: HealthCheck[] = [
      {
        id: "env",
        title: "Config (ENV)",
        description: "Verifică variabilele VITE necesare pentru conectare.",
        icon: GlobeLock,
        status: "pending",
      },
      {
        id: "supabase",
        title: "Conexiune Supabase",
        description: "Testează dacă clientul Supabase poate face request-uri.",
        icon: Server,
        status: "pending",
      },
      {
        id: "auth",
        title: "Autentificare",
        description: "Verifică dacă sesiunea curentă este validă.",
        icon: KeyRound,
        status: "pending",
      },
      {
        id: "db",
        title: "Bază de date (read)",
        description: "Încearcă un query simplu (poate e blocat de RLS — e normal).",
        icon: Database,
        status: "pending",
      },
      {
        id: "notifications",
        title: "Notificări (browser)",
        description: "Verifică suportul și permisiunea pentru notificări.",
        icon: Bell,
        status: "pending",
      },
      {
        id: "runtime",
        title: "Runtime",
        description: "Verifică dacă aplicația rulează fără erori critice în UI.",
        icon: Bug,
        status: "pending",
      },
    ];
    setChecks(initial);

    const update = (id: string, patch: Partial<HealthCheck>) => {
      setChecks(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    };

    // ENV
    try {
      const hasUrl = Boolean(env.VITE_SUPABASE_URL);
      const hasKey = Boolean(env.VITE_SUPABASE_PUBLISHABLE_KEY);
      if (hasUrl && hasKey) {
        update("env", { status: "ok", detail: "Configurarea ENV pare completă." });
      } else {
        update("env", {
          status: "error",
          detail: `Lipsesc: ${[!hasUrl ? "VITE_SUPABASE_URL" : null, !hasKey ? "VITE_SUPABASE_PUBLISHABLE_KEY" : null]
            .filter(Boolean)
            .join(", ")}`,
        });
      }
    } catch (e) {
      update("env", { status: "error", detail: (e as Error).message });
    }

    // Supabase connectivity (very lightweight)
    try {
      const { error } = await supabase.auth.getSession();
      if (error) {
        update("supabase", { status: "error", detail: error.message });
      } else {
        update("supabase", { status: "ok", detail: "Request către Supabase a reușit." });
      }
    } catch (e) {
      update("supabase", { status: "error", detail: (e as Error).message });
    }

    // Auth status
    try {
      if (session?.access_token && user) {
        update("auth", { status: "ok", detail: `Autentificat ca ${user.email ?? "(fără email)"}` });
      } else {
        update("auth", { status: "warning", detail: "Nu există sesiune activă (ești logat?)." });
      }
    } catch (e) {
      update("auth", { status: "error", detail: (e as Error).message });
    }

    // DB read check: this may fail with RLS — treat that as WARNING, not ERROR.
    try {
      const { error } = await supabase.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
      if (!error) {
        update("db", { status: "ok", detail: "Query simplu pe 'profiles' a reușit." });
      } else {
        const msg = error.message.toLowerCase();
        const isRls = msg.includes("row level security") || msg.includes("permission") || msg.includes("not allowed") || msg.includes("rls");
        update("db", {
          status: isRls ? "warning" : "error",
          detail: isRls
            ? "Query blocat de politici (RLS). Asta poate fi normal, în funcție de rol/politici."
            : error.message,
        });
      }
    } catch (e) {
      update("db", { status: "error", detail: (e as Error).message });
    }

    // Notifications
    try {
      if (typeof window === "undefined") {
        update("notifications", { status: "warning", detail: "Fără context de browser." });
      } else if (!("Notification" in window)) {
        update("notifications", { status: "warning", detail: "Browserul nu suportă Notification API." });
      } else {
        const perm = Notification.permission;
        if (perm === "granted") {
          update("notifications", { status: "ok", detail: "Permisiune acordată (granted)." });
        } else if (perm === "denied") {
          update("notifications", { status: "warning", detail: "Permisiune blocată (denied)." });
        } else {
          update("notifications", { status: "warning", detail: "Permisiune necerută încă (default)." });
        }
      }
    } catch (e) {
      update("notifications", { status: "error", detail: (e as Error).message });
    }

    // Runtime: if the page rendered and we reached here, it's a good sign.
    update("runtime", { status: "ok", detail: "UI render OK (ErrorBoundary nu a declanșat aici)." });

    setRunning(false);
  };

  useEffect(() => {
    // Auto-run once on open; keep it safe & silent.
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestNotifications = async () => {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      await Notification.requestPermission();
      runChecks();
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <main className={cn("transition-all duration-300", sidebarCollapsed ? "ml-20" : "ml-64")}>
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Diagnostic sistem</h1>
            <p className="text-sm text-muted-foreground">Verificări rapide pentru Supabase, roluri și notificări.</p>
          </div>
          <Button onClick={runChecks} disabled={running} className="gap-2">
            <RefreshCw className={cn("w-4 h-4", running && "animate-spin")} />
            Re-verifică
          </Button>
        </header>

        <div className="p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Context curent</CardTitle>
                <CardDescription>Informații utile pentru debug (fără date sensibile).</CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">Rol activ</div>
                  <div className="font-medium">{activeRole ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Utilizator</div>
                  <div className="font-medium">{user?.email ?? profile?.email ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Supabase URL</div>
                  <div className="font-medium break-all">{meta.supabaseUrl}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Supabase key</div>
                  <div className="font-medium">{meta.supabaseKeyMasked}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Build</div>
                  <div className="font-medium">{import.meta.env.MODE}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Timezone</div>
                  <div className="font-medium">{Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
                </div>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
              {checks.map((c) => {
                const sm = statusMeta[c.status];
                const StatusIcon = sm.icon;
                const ItemIcon = c.icon;
                return (
                  <Card key={c.id} className="relative overflow-hidden">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                          <ItemIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{c.title}</CardTitle>
                          <CardDescription>{c.description}</CardDescription>
                        </div>
                      </div>
                      <div className={cn("flex items-center gap-2 text-sm font-medium", sm.className)}>
                        <StatusIcon className={cn("w-4 h-4", c.status === "pending" && "animate-spin")} />
                        {sm.label}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Separator />
                      <div className="text-sm">
                        <span className="text-muted-foreground">Detalii: </span>
                        <span className="text-foreground">{c.detail ?? "—"}</span>
                      </div>
                      {c.id === "notifications" && typeof window !== "undefined" && ("Notification" in window) && Notification.permission === "default" && (
                        <Button variant="secondary" onClick={requestNotifications} className="gap-2">
                          <Bell className="w-4 h-4" />
                          Cere permisiune notificări
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Developer;
