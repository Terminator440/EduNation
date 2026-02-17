import { useEffect, useMemo, useState } from "react";
import { BellOff, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

type Banner = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "default" | "warning";
};

/**
 * Lightweight "status health" banners for the Home/Dashboard pages.
 * Keeps UI consistent and avoids dead/empty experiences.
 */
export default function StatusBanners() {
  const { activeRole } = useAuth();
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    setNotificationPermission(Notification.permission);
  }, []);

  const requestNotifications = async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
    } catch {
      // ignore
    }
  };

  const banners: Banner[] = useMemo(() => {
    const out: Banner[] = [];

    if (notificationPermission && notificationPermission !== "granted") {
      out.push({
        id: "notifications",
        icon: BellOff,
        title: "Notificările sunt dezactivate",
        description: "Activează notificările ca să primești anunțuri și mesaje la timp.",
        actionLabel: "Activează",
        onAction: requestNotifications,
        tone: "warning",
      });
    }

    // Timetable banner removed - timetable_entries table doesn't exist yet

    return out;
  }, [notificationPermission, activeRole]);

  if (banners.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {banners.map((b) => (
        <Alert
          key={b.id}
          className={b.tone === "warning" ? "border-amber-300/60 bg-amber-50/30 dark:bg-amber-500/10" : undefined}
        >
          <b.icon className="h-4 w-4" />
          <div>
            <AlertTitle>{b.title}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">{b.description}</p>
                {b.actionLabel && b.onAction && (
                  <Button size="sm" variant="secondary" onClick={b.onAction}>
                    {b.actionLabel}
                  </Button>
                )}
              </div>
            </AlertDescription>
          </div>
        </Alert>
      ))}
    </div>
  );
}
