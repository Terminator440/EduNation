import { toast } from "sonner";

/**
 * Global error handler for Supabase operations.
 * Displays user-friendly error messages via toast notifications.
 */
export function handleServiceError(error: unknown, context: string): void {
  let message = "A apărut o eroare neașteptată.";

  if (error instanceof Error) {
    // Extract user-friendly message from Supabase errors
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
      message = "Eroare de conexiune. Verifică conexiunea la internet.";
    } else if (errorMessage.includes("auth") || errorMessage.includes("unauthorized")) {
      message = "Nu ai permisiunea de a efectua această acțiune.";
    } else if (errorMessage.includes("not found") || errorMessage.includes("does not exist")) {
      message = "Resursa solicitată nu a fost găsită.";
    } else if (errorMessage.includes("duplicate") || errorMessage.includes("already exists")) {
      message = "Această înregistrare există deja.";
    } else if (errorMessage.includes("invalid") || errorMessage.includes("validation")) {
      message = "Datele introduse nu sunt valide.";
    } else {
      // Use the original error message if it's user-friendly
      message = error.message;
    }
  }

  toast.error("Eroare", {
    description: `${message} (${context})`,
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
