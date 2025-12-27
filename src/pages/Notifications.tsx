import { useEffect, useMemo, useState } from "react";

import { Bell, RefreshCw, Check } from "lucide-react";

import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

type NotificationRow = {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

const Notifications = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const fetchNotifications = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,created_at,read_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows((data ?? []) as any);
    } catch (e: any) {
      toast({
        title: "Nu am putut încărca notificările",
        description: toFriendlySupabaseError(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read_at: new Date().toISOString() } : r)));
    } catch (e: any) {
      toast({
        title: "Nu am putut marca notificarea ca citită",
        description: toFriendlySupabaseError(e),
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadCount = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <div className="flex-1">
        <div className="p-6 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Bell className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Notificări</h1>
                <p className="text-muted-foreground">
                  {unreadCount > 0 ? `${unreadCount} necitite` : "Ești la zi."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <RoleSwitcher />
              <Button variant="outline" onClick={fetchNotifications} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Reîmprospătează
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Inbox</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stare</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Titlu</TableHead>
                    <TableHead>Mesaj</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nu există notificări.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.id} className={!r.read_at ? "bg-muted/30" : ""}>
                        <TableCell>{r.read_at ? "Citită" : "Nouă"}</TableCell>
                        <TableCell>{r.type ?? "-"}</TableCell>
                        <TableCell className="font-medium">{r.title ?? "-"}</TableCell>
                        <TableCell className="max-w-[520px] truncate">{r.body ?? "-"}</TableCell>
                        <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={!!r.read_at} onClick={() => markRead(r.id)}>
                            <Check className="h-4 w-4 mr-2" />
                            Marchează citită
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
