import { useState, useCallback } from "react";
import { MessageSquare, Send } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk, getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import {
  useRecipientsForStudent,
  useTicketsSentByParent,
  useCreateTicket,
} from "@/features/tickets/queries";

type Child = { id: string; full_name: string | null };

export default function Tickets() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [toUserId, setToUserId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const childrenQuery = useQuery({
    queryKey: ["parent-children-tickets", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Child[]> => {
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId) return [];
      const res = await supabase
        .from("parent_student_relations")
        .select("student:students!inner(id,full_name,school_id)")
        .eq("parent_user_id", user!.id)
        .eq("students.school_id", schoolId);
      type Row = { student: { id: string; full_name: string | null } | null };
      const rows = assertSupabaseOk(res, "parent-children") as Row[];
      return (rows ?? []).map((r) => r.student).filter((s): s is NonNullable<typeof s> => s != null);
    },
  });

  const children = childrenQuery.data ?? [];
  const recipientsQuery = useRecipientsForStudent(selectedChildId);
  const recipients = recipientsQuery.data ?? [];
  const sentQuery = useTicketsSentByParent();
  const createMutation = useCreateTicket();

  const handleSend = useCallback(() => {
    if (!selectedChildId || !toUserId || !subject.trim() || !body.trim()) {
      toast({
        title: "Eroare",
        description: "Completați elevul, destinatarul, subiectul și mesajul.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(
      { student_id: selectedChildId, to_user_id: toUserId, subject: subject.trim(), body: body.trim() },
      {
        onSuccess: () => {
          toast({ title: "Mesaj trimis", description: "Mesajul a fost trimis cu succes." });
          setSubject("");
          setBody("");
          setToUserId("");
          sentQuery.refetch();
        },
        onError: (e) => {
          toast({
            title: "Eroare",
            description: e instanceof Error ? e.message : "Nu s-a putut trimite mesajul.",
            variant: "destructive",
          });
        },
      }
    );
  }, [selectedChildId, toUserId, subject, body, createMutation, toast, sentQuery]);

  return (
    <div className="min-h-screen w-full bg-background max-w-full overflow-x-hidden">
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} />
      <main
        className={cn(
          "w-full min-w-0 max-w-full overflow-x-hidden transition-all duration-300 pt-14 md:pt-0",
          sidebarCollapsed ? "md:ml-20" : "md:ml-64"
        )}
      >
        <header className="w-full h-16 border-b flex items-center justify-between gap-4 px-4 sm:px-6">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Mesaje către profesor / diriginte
          </h1>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
          </div>
        </header>

        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Trimite un mesaj</CardTitle>
              <p className="text-sm text-muted-foreground">
                Alege elevul, destinatarul (profesor sau diriginte) și scrie mesajul.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Elev</Label>
                <Select
                  value={selectedChildId ?? ""}
                  onValueChange={(v) => {
                    setSelectedChildId(v || null);
                    setToUserId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Alege elevul" />
                  </SelectTrigger>
                  <SelectContent>
                    {children.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name ?? "Fără nume"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedChildId && (
                <div>
                  <Label>Destinatar</Label>
                  <Select value={toUserId} onValueChange={setToUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Alege profesorul sau dirigintele" />
                    </SelectTrigger>
                    <SelectContent>
                      {recipients.map((r) => (
                        <SelectItem key={r.user_id} value={r.user_id}>
                          {r.full_name ?? "Profesor"} {r.subject_name ? `(${r.subject_name})` : ""}
                        </SelectItem>
                      ))}
                      {recipients.length === 0 && !recipientsQuery.isLoading && (
                        <SelectItem value="_none" disabled>
                          Nu există profesori asignați
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Subiect</Label>
                <Input
                  placeholder="Ex: Întrebare despre note"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div>
                <Label>Mesaj</Label>
                <Textarea
                  placeholder="Scrie mesajul aici..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                />
              </div>
              <Button
                onClick={handleSend}
                disabled={createMutation.isPending || !selectedChildId || !toUserId || !subject.trim() || !body.trim()}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                {createMutation.isPending ? "Se trimite..." : "Trimite mesaj"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mesaje trimise</CardTitle>
            </CardHeader>
            <CardContent>
              {sentQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Se încarcă...</p>
              ) : (sentQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu ai trimis încă niciun mesaj.</p>
              ) : (
                <ul className="space-y-3">
                  {(sentQuery.data ?? []).map((t) => (
                    <li
                      key={t.id}
                      className="border rounded-lg p-3 text-sm"
                    >
                      <div className="font-medium">{t.subject}</div>
                      <div className="text-muted-foreground mt-1">
                        Către profesor · despre {t.student?.full_name ?? "elev"} ·{" "}
                        {new Date(t.created_at).toLocaleString("ro-RO")}
                      </div>
                      <p className="mt-2 line-clamp-2">{t.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
