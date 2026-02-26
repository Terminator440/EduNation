/**
 * Normalized error format for consistent handling across app and services.
 */

export type NormalizedError = {
  message: string;
  code?: string;
};

/**
 * Application error for consistent handling: log + throw from services.
 * UI catches and shows toast or inline message.
 */
export class AppError extends Error {
  readonly code?: string;
  readonly context?: string;

  constructor(message: string, options?: { code?: string; context?: string; cause?: unknown }) {
    super(message);
    this.name = "AppError";
    this.code = options?.code;
    this.context = options?.context;
    if (options?.cause instanceof Error) this.cause = options.cause;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Normalize any thrown value to { message, code? }.
 * Use in try/catch and for toast/UI.
 */
export function normalizeError(err: unknown): NormalizedError {
  if (err == null) return { message: "A apărut o eroare neașteptată." };
  if (typeof err === "object" && err !== null && "message" in err) {
    const o = err as { message?: string; code?: string; status?: number };
    const message =
      typeof o.message === "string"
        ? o.message
        : "A apărut o eroare neașteptată.";
    const code = typeof o.code === "string" ? o.code : undefined;
    return { message, code };
  }
  if (typeof err === "string") return { message: err };
  return { message: "A apărut o eroare neașteptată." };
}

/**
 * User-friendly login error message (wrong password vs user not found).
 * Supabase often returns "Invalid login credentials" for both.
 */
export function getLoginErrorMessage(err: unknown): string {
  const { message } = normalizeError(err);
  const lower = message.toLowerCase();
  if (
    lower.includes("networkerror when attempting to fetch resource") ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("network request failed")
  ) {
    return "Serviciul de autentificare nu răspunde momentan. Verificați conexiunea, apoi configurația Supabase (URL + cheie publică) dacă problema persistă.";
  }
  if (lower.includes("invalid login") || lower.includes("invalid_credentials")) {
    return "Email sau parolă incorectă. Verificați datele și încercați din nou.";
  }
  if (lower.includes("user not found") || lower.includes("user_not_found")) {
    return "Nu există un cont cu acest email.";
  }
  if (lower.includes("email not confirmed")) {
    return "Contul nu a fost confirmat. Verificați emailul.";
  }
  return message || "Autentificare eșuată. Încercați din nou.";
}
