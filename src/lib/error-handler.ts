import { toast } from "sonner";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

/**
 * Global error handler for Supabase operations.
 * Displays user-friendly error messages via toast notifications.
 */
export function handleServiceError(error: unknown, _context?: string): void {
  const message = toFriendlySupabaseError(error);
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
