import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import RoleSwitcher from "@/components/RoleSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const Notifications = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const onToggleSidebar = useCallback(() => setIsCollapsed((prev) => !prev), []);
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  return (
    <div className="min-h-screen w-full bg-background flex">
      <Sidebar isCollapsed={isCollapsed} onToggle={onToggleSidebar} />
      <div className={cn(
        "flex-1 min-w-0 w-full pt-14 md:pt-0",
        isCollapsed ? "ml-0 md:ml-20" : "ml-0 md:ml-64"
      )}>
        <div className="w-full max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 border-b border-border bg-card shrink-0">
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
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-1">
                  <CheckCheck className="h-4 w-4" />
                  Marchează tot ca citit
                </Button>
              )}
              <ThemeToggle />
              <RoleSwitcher />
            </div>
          </div>
        </div>

        <div className="w-full max-w-screen-xl mx-auto p-4 sm:p-6 lg:p-8">
          <Card>
            <CardHeader>
              <CardTitle>Inbox</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Spinner size="lg" className="h-8 w-8 text-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nu ai notificări noi.
                </p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => {
                    const isUnread = !n.is_read && !n.read_at;
                    const content = (
                      <div
                        key={n.id}
                        className={cn(
                          "p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer",
                          isUnread && "bg-primary/5 border-primary/20"
                        )}
                        onClick={() => isUnread && markAsRead(n.id)}
                      >
                        <div className="flex gap-3">
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-destructive shrink-0 mt-1.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{n.title || "Notificare"}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {n.message ?? n.body ?? ""}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {n.type ?? "General"} ·{" "}
                              {new Date(n.created_at).toLocaleString("ro-RO")}
                            </p>
                            {n.link && (
                              <Link
                                to={n.link}
                                className="text-sm text-primary hover:underline mt-2 inline-block"
                              >
                                Vezi detalii →
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                    return n.link ? (
                      <Link key={n.id} to={n.link}>
                        {content}
                      </Link>
                    ) : (
                      content
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
