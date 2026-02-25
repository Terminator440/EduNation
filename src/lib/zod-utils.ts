import { z } from "zod";

/**
 * Return user-friendly error messages from Zod validation.
 * Use in UI to show inline or toast.
 */
export function formatZodErrors(error: z.ZodError): string[] {
  return error.errors.map((e) => {
    const path = e.path.length ? `${e.path.join(".")}: ` : "";
    return path + e.message;
  });
}

/**
 * Return first error message or a generic one.
 */
export function getFirstZodMessage(error: z.ZodError): string {
  const first = error.errors[0];
  return first ? `${first.path.join(".")}: ${first.message}` : "Date invalide. Verificați câmpurile.";
}

/**
 * Safe parse and return either success data or formatted errors.
 */
export function safeParseWithErrors<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: formatZodErrors(result.error),
  };
}
