import { useState, useEffect } from "react";

/**
 * Shows a small banner when the app is offline so users know they're in read-only mode
 * using cached / localStorage data.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

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

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-500/90 text-amber-950 text-center py-1.5 px-4 text-sm font-medium"
    >
      Fără conexiune. Datele afișate sunt din cache (mod doar citire).
    </div>
  );
}
