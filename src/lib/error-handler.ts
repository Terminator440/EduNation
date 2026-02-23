import { toast } from "sonner";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";
import { logError } from "@/lib/logger";

/**
 * Global error handler for Supabase operations.
 * Displays user-friendly error messages via toast notifications and logs for monitoring.
 */
export function handleServiceError(error: unknown, context?: string): void {
  const message = toFriendlySupabaseError(error);
  logError("Service error", error, { context });
  toast.error("Eroare", {
    description: message,
    duration: 5000,
  });
}

/**
 * Display success notification for important actions.
 */
export function showSuccessMessage(message: string, description?: string): void {
  toast.success(message, {
    description,
    duration: 3000,
  });
}
