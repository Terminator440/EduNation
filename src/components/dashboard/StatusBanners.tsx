import { useEffect, useMemo, useState } from "react";
import { BellOff, CalendarX2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useStudentScope } from "@/features/academics/queries";
import { supabase } from "@/integrations/supabase/client";
import { assertSupabaseOk } from "@/lib/supabase-helpers";
import { useQuery } from "@tanstack/react-query";

type Banner = {
  id: string;
  icon: any;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "default" | "warning";
};

/**
 * Lightweight “status health” banners for the Home/Dashboard pages.
 * Keeps UI consistent and avoids dead/empty experiences.
 */
export default function StatusBanners() {
  const { user, activeRole } = useAuth();
  const scopeQuery = useStudentScope(activeRole, user?.id ?? null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    setNotificationPermission(Notification.permission);
  }, []);

  const classIdQuery = useQuery({
    queryKey: ["primary-student-class", activeRole, user?.id, scopeQuery.data?.studentIds],
    enabled: (scopeQuery.data?.studentIds?.length ?? 0) > 0,
    queryFn: async () => {
      const studentId = scopeQuery.data!.studentIds[0];
      const res = await supabase
        .from("students")
        .select("id,class_id")
        .eq("id", studentId)
        .maybeSingle();
      const row = assertSupabaseOk(res, "students.select(class_id)");
      return row?.class_id ?? null;
    },
  });

  const todaysTimetableQuery = useQuery({
    queryKey: ["timetable-today", classIdQuery.data],
    enabled: Boolean(classIdQuery.data),
    queryFn: async () => {
      const weekday = new Date().getDay();
      const res = await supabase
        .from("timetable_entries")
        .select("id")
        .eq("class_id", classIdQuery.data as any)
        .eq("weekday", weekday)
        .limit(1);
      const rows = assertSupabaseOk(res, "timetable_entries.select(today)") as any[];
      return rows?.length ?? 0;
    },
  });

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

    // Only show timetable warning for student/parent views.
    if ((activeRole === "student" || activeRole === "parent") && classIdQuery.data) {
      const count = todaysTimetableQuery.data ?? null;
      if (count === 0) {
        out.push({
          id: "timetable",
          icon: CalendarX2,
          title: "Nu există orar pentru azi",
          description: "Școala nu a publicat încă orele pentru ziua curentă sau nu ești asociat(ă) cu o clasă.",
          tone: "warning",
        });
      }
    }

    return out;
  }, [notificationPermission, activeRole, classIdQuery.data, todaysTimetableQuery.data]);

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
