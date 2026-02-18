import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ServerCrash,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";

type DbStatus = "checking" | "ok" | "error";

export default function SystemHealth() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [onlineCount, setOnlineCount] = useState(0);

  const {
    maintenanceMode,
    isLoading: maintenanceLoading,
    setMaintenanceMode,
    isSetting,
    } = useMaintenanceMode();

  const dbStatusQuery = useQuery({
    queryKey: ["system-health", "db"],
    queryFn: async (): Promise<DbStatus> => {
      const { error } = await supabase.rpc("get_maintenance_mode");
      return error ? "error" : "ok";
    },
    refetchInterval: 30_000,
  });

  const errorsQuery = useQuery({
    queryKey: ["system-health", "errors"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_system_recent_errors");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        created_at: string | null;
        user_name: string | null;
        message: string | null;
        details: Record<string, unknown> | null;
      }>;
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel("system-health:online")
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const userIds = new Set<string>();
        Object.values(state).forEach((presences) => {
          presences.forEach((p: { user_id?: string }) => {
            if (p.user_id) userIds.add(p.user_id);
          });
        });
        setOnlineCount(userIds.size);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ user_id: user.id, email: user.email ?? undefined });
        }
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, user?.email]);

  const toggleMaintenance = useCallback(async () => {
    try {
      await setMaintenanceMode(!maintenanceMode);
      toast({
        title: maintenanceMode ? "Maintenance oprit" : "Maintenance activat",
        description: maintenanceMode
          ? "Utilizatorii pot accesa din nou aplicația."
          : "Doar adminii și developerii au acces până la dezactivare.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Eroare la setare";
      toast({ title: "Eroare", description: msg, variant: "destructive" });
    }
  }, [maintenanceMode, setMaintenanceMode, toast]);

  const dbStatus = dbStatusQuery.data ?? "checking";
  const errors = errorsQuery.data ?? [];

  return (
    <DashboardLayout
      title="System Health"
      subtitle="Status sistem – doar admini și developeri"
    >
      <div className="space-y-6">
        {/* Online users + DB status */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Utilizatori online</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onlineCount}</div>
              <p className="text-xs text-muted-foreground">
                Supabase Presence pe canalul system-health:online
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conexiune bază de date</CardTitle>
              {dbStatus === "checking" && <Spinner size="sm" className="text-muted-foreground" />}
              {dbStatus === "ok" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {dbStatus === "error" && <XCircle className="h-4 w-4 text-destructive" />}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {dbStatus === "checking" && <span className="text-muted-foreground">Se verifică…</span>}
                {dbStatus === "ok" && (
                  <>
                    <Badge variant="default" className="bg-green-600">OK</Badge>
                    <span className="text-sm text-muted-foreground">Conexiune activă</span>
                  </>
                )}
                {dbStatus === "error" && (
                  <>
                    <Badge variant="destructive">Eroare</Badge>
                    <span className="text-sm text-muted-foreground">
                      {dbStatusQuery.error instanceof Error
                        ? dbStatusQuery.error.message
                        : "Nu s-a putut verifica"}
                    </span>
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-8 text-xs"
                onClick={() => void dbStatusQuery.refetch()}
                disabled={dbStatusQuery.isFetching}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reîmprospătează
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mod mentenanță</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {maintenanceLoading ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={maintenanceMode ? "destructive" : "secondary"}>
                      {maintenanceMode ? "ACTIV" : "INACTIV"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Când e activ, doar adminii și developerii pot accesa aplicația.
                  </p>
                  <Button
                    size="sm"
                    variant={maintenanceMode ? "outline" : "destructive"}
                    onClick={() => void toggleMaintenance()}
                    disabled={isSetting}
                  >
                    {isSetting ? (
                      <Spinner size="sm" className="mr-1" />
                    ) : maintenanceMode ? (
                      "Oprește mentenanța"
                    ) : (
                      "Activează mentenanța"
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Last 10 errors */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Ultimele 10 erori (log frontend)
              </CardTitle>
              <CardDescription>
                Erori înregistrate prin ErrorBoundary (action: error.frontend) în audit_logs
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void errorsQuery.refetch()}
              disabled={errorsQuery.isFetching}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Reîmprospătează
            </Button>
          </CardHeader>
          <CardContent>
            {errorsQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            )}
            {errorsQuery.error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                <ServerCrash className="h-4 w-4 shrink-0" />
                {errorsQuery.error instanceof Error
                  ? errorsQuery.error.message
                  : "Eroare la încărcarea log-urilor"}
              </div>
            )}
            {!errorsQuery.isLoading && !errorsQuery.error && errors.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">Nicio eroare înregistrată.</p>
            )}
            {!errorsQuery.isLoading && errors.length > 0 && (
              <ul className="space-y-3">
                {errors.map((err) => (
                  <li
                    key={err.id}
                    className="rounded-lg border border-border bg-muted/30 p-3 text-sm font-mono"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-muted-foreground text-xs">
                        {err.created_at
                          ? new Date(err.created_at).toLocaleString("ro-RO")
                          : "—"}
                      </span>
                      {err.user_name && (
                        <Badge variant="outline" className="text-xs">
                          {err.user_name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-foreground break-words">
                      {err.message ?? "(fără mesaj)"}
                    </p>
                    {err.details &&
                      typeof err.details === "object" &&
                      Object.keys(err.details).length > 0 && (
                        <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto max-h-24 overflow-y-auto">
                          {JSON.stringify(err.details, null, 2)}
                        </pre>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
