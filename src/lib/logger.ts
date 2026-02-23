/**
 * Structured logging for production SaaS.
 * Use for errors and important events; optional Sentry integration can be added later.
 */
const LOG_LEVEL = (import.meta.env.VITE_LOG_LEVEL as string) || "info";
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

function shouldLog(level: keyof typeof LEVELS): boolean {
  const current = LEVELS[LOG_LEVEL as keyof typeof LEVELS] ?? 1;
  return (LEVELS[level] ?? 1) >= current;
}

type LogContext = Record<string, unknown>;

export function logDebug(message: string, context?: LogContext): void {
  if (shouldLog("debug")) {
    console.debug("[eduro]", message, context ?? "");
  }
}

export function logInfo(message: string, context?: LogContext): void {
  if (shouldLog("info")) {
    console.info("[eduro]", message, context ?? "");
  }
}

export function logWarn(message: string, context?: LogContext): void {
  if (shouldLog("warn")) {
    console.warn("[eduro]", message, context ?? "");
  }
}

export function logError(
  message: string,
  error?: unknown,
  context?: LogContext
): void {
  if (shouldLog("error")) {
    const payload = {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    };
    console.error("[eduro]", message, payload);
    // TODO: optional Sentry.captureException(error);
  }
}
