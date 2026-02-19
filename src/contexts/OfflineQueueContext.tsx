import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addToOfflineQueue,
  getOfflineQueue,
  getOfflineQueueLength,
  removeFromOfflineQueue,
  type OfflineQueueItem,
  type OfflineQueueItemType,
} from "@/lib/offlineQueueDb";
import { addGrade, updateGrade, deleteGrade } from "@/features/grades/services/grades.service";
import { addAttendance, updateAttendance, deleteAttendance } from "@/features/attendance/services/attendance.service";
import { isConflictError, CONFLICT_MESSAGE } from "@/utils/supabaseErrors";

type OfflineQueueContextValue = {
  queueLength: number;
  addToQueue: (type: OfflineQueueItemType, payload: unknown) => Promise<void>;
  processQueue: () => Promise<void>;
};

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

export function useOfflineQueue(): OfflineQueueContextValue {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) {
    return {
      queueLength: 0,
      addToQueue: async () => {},
      processQueue: async () => {},
    };
  }
  return ctx;
}

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [queueLength, setQueueLength] = useState(0);

  const refreshLength = useCallback(async () => {
    try {
      const n = await getOfflineQueueLength();
      setQueueLength(n);
    } catch {
      setQueueLength(0);
    }
  }, []);

  const addToQueue = useCallback(
    async (type: OfflineQueueItemType, payload: unknown) => {
      const id = crypto.randomUUID();
      try {
        await addToOfflineQueue({ id, type, payload });
        await refreshLength();
      } catch (e) {
        console.error("Offline queue add failed:", e);
      }
    },
    [refreshLength]
  );

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  const processQueue = useCallback(async () => {
    let items: OfflineQueueItem[];
    try {
      items = await getOfflineQueue();
    } catch (e) {
      console.error("Offline queue read failed:", e);
      return;
    }
    if (items.length === 0) {
      await refreshLength();
      return;
    }

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let processedCount = 0;
    for (const item of items) {
      let lastError: unknown;
      let succeeded = false;
      for (let attempt = 0; attempt < MAX_RETRIES && !succeeded; attempt++) {
        try {
          switch (item.type) {
          case "add_grade":
            await addGrade(item.payload as Parameters<typeof addGrade>[0]);
            await queryClient.invalidateQueries({ queryKey: ["grades"] });
            await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
            await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
            await queryClient.invalidateQueries({ queryKey: ["student-scope"] });
            break;
          case "update_grade": {
            const { gradeId, updates } = item.payload as { gradeId: string; updates: Parameters<typeof updateGrade>[1] };
            await updateGrade(gradeId, updates);
            await queryClient.invalidateQueries({ queryKey: ["grades"] });
            await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
            await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
            break;
          }
          case "delete_grade": {
            const { gradeId } = item.payload as { gradeId: string };
            await deleteGrade(gradeId);
            await queryClient.invalidateQueries({ queryKey: ["grades"] });
            await queryClient.invalidateQueries({ queryKey: ["subject-averages"] });
            await queryClient.invalidateQueries({ queryKey: ["general-averages"] });
            break;
          }
          case "add_attendance":
            await addAttendance(item.payload as Parameters<typeof addAttendance>[0]);
            await queryClient.invalidateQueries({ queryKey: ["attendance"] });
            break;
          case "update_attendance": {
            const { attendanceId, updates } = item.payload as {
              attendanceId: string;
              updates: Parameters<typeof updateAttendance>[1];
            };
            await updateAttendance(attendanceId, updates);
            await queryClient.invalidateQueries({ queryKey: ["attendance"] });
            break;
          }
          case "delete_attendance": {
            const { attendanceId } = item.payload as { attendanceId: string };
            await deleteAttendance(attendanceId);
            await queryClient.invalidateQueries({ queryKey: ["attendance"] });
            break;
          }
          default:
            await removeFromOfflineQueue(item.id);
            succeeded = true;
            continue;
        }
          await removeFromOfflineQueue(item.id);
          processedCount += 1;
          succeeded = true;
        } catch (err) {
          lastError = err;
          if (isConflictError(err)) {
            await removeFromOfflineQueue(item.id);
            toast.warning("Conflict la sincronizare", { description: CONFLICT_MESSAGE });
            await queryClient.invalidateQueries({ queryKey: ["grades"] });
            await queryClient.invalidateQueries({ queryKey: ["attendance"] });
            succeeded = true;
            break;
          }
          if (attempt < MAX_RETRIES - 1) {
            await delay(RETRY_DELAY_MS * Math.pow(2, attempt));
          }
        }
      }
      if (!succeeded && lastError) {
        console.warn("Offline queue item failed after retries:", item.id, lastError);
      }
    }

    await refreshLength();
    if (processedCount > 0) {
      toast.success("Sincronizare finalizată", {
        description: `${processedCount} acțiuni au fost sincronizate cu serverul.`,
      });
    }
  }, [queryClient, refreshLength]);

  useEffect(() => {
    refreshLength();
  }, [refreshLength]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => processQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [processQueue]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      processQueue();
    }
  }, []); // run once on mount when already online (e.g. tab reopened)

  const value: OfflineQueueContextValue = {
    queueLength,
    addToQueue,
    processQueue,
  };

  return (
    <OfflineQueueContext.Provider value={value}>
      {children}
    </OfflineQueueContext.Provider>
  );
}
