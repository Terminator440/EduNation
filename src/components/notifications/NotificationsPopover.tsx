import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Acum";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ro-RO");
};

const getTypeLabel = (type: string | null) => {
  const map: Record<string, string> = {
    grade: "Notă",
    attendance: "Prezență",
    announcement: "Anunț",
    system: "Sistem",
  };
  return type ? map[type] ?? type : "General";
};

export function NotificationsPopover() {
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read && !n.read_at) {
      markAsRead(n.id);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[0.625rem] font-medium text-destructive-foreground flex items-center justify-center"
              aria-label={`${unreadCount} necitite`}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Notificări</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={markAllAsRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marchează tot ca citit
            </Button>
          )}
        </div>

        <ScrollArea className="h-[20rem]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="py-8 px-4 text-center text-sm text-muted-foreground">
              Nu ai notificări noi.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const isUnread = !n.is_read && !n.read_at;
                const content = (
                  <div
                    className={cn(
                      "relative px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer",
                      isUnread && "bg-primary/5"
                    )}
                    onClick={() => handleNotificationClick(n)}
                  >
                    {isUnread && (
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-destructive shrink-0" aria-hidden />
                    )}
                    <div className={cn("flex-1 min-w-0", isUnread && "pl-4")}>
                        <p className={cn(
                          "font-medium text-sm",
                          isUnread && "text-foreground"
                        )}>
                          {n.title || "Notificare"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.message ?? n.body ?? ""}
                        </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[0.625rem] text-muted-foreground">
                          {getTypeLabel(n.type)} · {formatDate(n.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                );

                if (n.link) {
                  return (
                    <Link key={n.id} to={n.link} className="block">
                      {content}
                    </Link>
                  );
                }
                return <div key={n.id}>{content}</div>;
              })}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <Link to="/notifications">
              <Button variant="ghost" size="sm" className="w-full text-xs">
                Vezi toate notificările
              </Button>
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
