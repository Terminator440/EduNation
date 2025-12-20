import { z } from "zod";

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

/**
 * Runtime environment variables validated at startup.
 *
 * In Vite, only variables prefixed with VITE_ are exposed to the client.
 */
export const env = (() => {
  const parsed = EnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    // Keep it actionable: missing env vars are a common deployment failure.
    // eslint-disable-next-line no-console
    console.error("Invalid or missing environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Missing/invalid VITE_ environment variables. Check your deployment settings.");
  }

  return parsed.data;
})();
