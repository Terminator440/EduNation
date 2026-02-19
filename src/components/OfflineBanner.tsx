import { useState, useEffect } from "react";
import { useOfflineQueue } from "@/contexts/OfflineQueueContext";

/**
 * Shows a small banner when the app is offline. When there are queued actions,
 * informs the user they will sync on reconnect.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const { queueLength } = useOfflineQueue();

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!isOffline && queueLength === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-500/90 text-amber-950 text-center py-1.5 px-4 text-sm font-medium"
    >
      {isOffline ? (
        queueLength > 0 ? (
          <>Fără conexiune. {queueLength} {queueLength === 1 ? "acțiune" : "acțiuni"} vor fi sincronizate la reconectare.</>
        ) : (
          "Fără conexiune. Datele afișate sunt din cache (mod doar citire)."
        )
      ) : (
        queueLength > 0 && (
          <>Sincronizare în curs… {queueLength} {queueLength === 1 ? "acțiune" : "acțiuni"} în coadă.</>
        )
      )}
    </div>
  );
}
