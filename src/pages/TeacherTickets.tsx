import { useState, useCallback } from "react";
import { MessageSquare, Check } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useTicketsForRecipient,
  useUnreadTicketsCount,
  useMarkTicketAsRead,
} from "@/features/tickets/queries";
import type { TicketWithDetails } from "@/features/tickets/types";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function TeacherTickets() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inboxQuery = useTicketsForRecipient();
  const unreadQuery = useUnreadTicketsCount();
  const markRead = useMarkTicketAsRead();

  const tickets = inboxQuery.data ?? [];
  const unreadCount = unreadQuery.data ?? 0;
  const selected = tickets.find((t) => t.id === selectedId);

  const handleOpen = useCallback(
    (t: TicketWithDetails) => {
      setSelectedId(t.id);
      if (!t.read_at) {
        markRead.mutate(t.id);
        unreadQuery.refetch();
        inboxQuery.refetch();
      }
    },
    [markRead, unreadQuery, inboxQuery]
  );

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
            Mesaje de la părinți
            {unreadCount > 0 && (
              <span className="rounded-full bg-destructive text-destructive-foreground text-xs font-medium px-2 py-0.5">
                {unreadCount}
              </span>
            )}
          </h1>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <RoleSwitcher />
          </div>
        </header>

        <div className="max-w-4xl mx-auto p-4 sm:p-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inbox</CardTitle>
              <p className="text-sm text-muted-foreground">
                Mesajele trimise de părinți, legate de elevii din clasele tale.
              </p>
            </CardHeader>
            <CardContent>
              {inboxQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Se încarcă...</p>
              ) : tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu ai mesaje noi.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ul className="space-y-2 border-r pr-4">
                    {tickets.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => handleOpen(t)}
                          className={cn(
                            "w-full text-left rounded-lg p-3 border transition-colors",
                            selectedId === t.id
                              ? "bg-primary/10 border-primary"
                              : !t.read_at
                                ? "bg-primary/5 border-l-4 border-l-primary"
                                : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {!t.read_at && (
                              <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden />
                            )}
                            <span className="font-medium truncate">{t.subject}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {t.from_profile?.full_name ?? "Părinte"} · {t.student?.full_name ?? "elev"} ·{" "}
                            {formatDate(t.created_at)}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="min-h-[200px]">
                    {selected ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">{selected.subject}</h3>
                          {selected.read_at && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Check className="w-3 h-3" /> Citit
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          De la {selected.from_profile?.full_name ?? "părinte"} · despre{" "}
                          {selected.student?.full_name ?? "elev"} · {formatDate(selected.created_at)}
                        </div>
                        <div className="pt-4 whitespace-pre-wrap text-sm">{selected.body}</div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Alege un mesaj din listă.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
