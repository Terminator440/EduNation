import { useEffect, useMemo, useState } from "react";

import { Megaphone, Plus, RefreshCw } from "lucide-react";

import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string;
  target_role: string | null;
};

const ALL_ROLES = [
  "student",
  "parent",
  "teacher",
  "homeroom_teacher",
  "secretariat",
  "director",
  "uat_admin",
] as const;

const Announcements = () => {
  const { toast } = useToast();
  const { activeRole } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetRole, setTargetRole] = useState<string | null>(null);

  const canPublish = useMemo(() => {
    return activeRole === "director" || activeRole === "secretariat" || activeRole === "uat_admin";
  }, [activeRole]);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      // NOTE: announcements table is added via migration; we cast to any to avoid type-gen mismatch.
      const { data, error } = await (supabase as any)
        .from("announcements")
        .select("id,title,content,created_at,created_by,target_role")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setAnnouncements((data ?? []) as AnnouncementRow[]);
    } catch (e: any) {
      toast({
        title: "Nu am putut încărca anunțurile",
        description: toFriendlySupabaseError(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const publishAnnouncement = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: "Completează titlul și conținutul",
        description: "Anunțul trebuie să aibă un titlu și un mesaj.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        title: title.trim(),
        content: content.trim(),
        target_role: targetRole,
      };

      const { error } = await (supabase as any).from("announcements").insert(payload);
      if (error) throw error;

      setTitle("");
      setContent("");
      setTargetRole(null);
      toast({ title: "Anunț publicat" });
      await fetchAnnouncements();
    } catch (e: any) {
      toast({
        title: "Nu am putut publica anunțul",
        description: toFriendlySupabaseError(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleAnnouncements = useMemo(() => {
    if (!activeRole) return announcements;
    return announcements.filter((a) => !a.target_role || a.target_role === activeRole);
  }, [announcements, activeRole]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />

      <div className={cn("transition-all duration-300", isCollapsed ? "ml-20" : "ml-64")}>
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Megaphone className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Anunțuri</h1>
          </div>
          <div className="flex items-center gap-4">
            <RoleSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <main className="p-6 space-y-6">
          {canPublish && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Publică anunț
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ann-title">Titlu</Label>
                    <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Ședință cu părinții" />
                  </div>
                  <div className="space-y-2">
                    <Label>Vizibil pentru</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={targetRole ?? ""}
                      onChange={(e) => setTargetRole(e.target.value ? e.target.value : null)}
                    >
                      <option value="">Toată lumea</option>
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ann-content">Mesaj</Label>
                  <Textarea
                    id="ann-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Scrie mesajul anunțului..."
                    className="min-h-[120px]"
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={publishAnnouncement} disabled={loading} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Publică
                  </Button>
                  <Button variant="outline" onClick={fetchAnnouncements} disabled={loading} className="gap-2">
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    Reîncarcă
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Ultimele anunțuri</CardTitle>
              {!canPublish && (
                <Button variant="outline" onClick={fetchAnnouncements} disabled={loading} className="gap-2">
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  Reîncarcă
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {visibleAnnouncements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu există anunțuri disponibile.</p>
              ) : (
                <div className="space-y-4">
                  {visibleAnnouncements.map((a) => (
                    <div key={a.id} className="p-4 rounded-lg border border-border bg-background">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">{a.title}</h3>
                          {a.target_role && (
                            <p className="text-xs text-muted-foreground mt-1">Vizibil pentru: {a.target_role}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(a.created_at).toLocaleString("ro-RO")}
                        </span>
                      </div>
                      <p className="text-sm mt-3 whitespace-pre-wrap">{a.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default Announcements;
