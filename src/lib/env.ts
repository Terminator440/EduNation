import { z } from "zod";

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_PROJECT_ID: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{20}$/)
    .optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const extractProjectRefFromUrl = (supabaseUrl: string): string | null => {
  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const isSupabasePublishableKey = (publishableKey: string): boolean =>
  publishableKey.startsWith("sb_publishable_") || publishableKey.split(".").length === 3;

const extractProjectRefFromPublishableKey = (publishableKey: string): string | null => {
  if (publishableKey.startsWith("sb_publishable_")) return null;
  try {
    const [, payload] = publishableKey.split(".");
    if (!payload) return null;
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload =
      normalizedPayload + "=".repeat((4 - (normalizedPayload.length % 4)) % 4);
    const decodedPayload = JSON.parse(atob(paddedPayload)) as { ref?: unknown };
    return typeof decodedPayload.ref === "string" ? decodedPayload.ref : null;
  } catch {
    return null;
  }
};

/**
 * Runtime environment variables validated at startup.
 *
 * In Vite, only variables prefixed with VITE_ are exposed to the client.
 */
export const env = (() => {
  const parsed = EnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    // Keep it actionable: missing env vars are a common deployment failure.
    // eslint-disable-next-line no-console
    console.error("Invalid or missing environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Missing/invalid VITE_ environment variables. Check your deployment settings.");
  }

  const publishableKey = parsed.data.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
  if (publishableKey.includes("REPLACE_WITH_")) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY is placeholder. Replace it with your Supabase publishable key."
    );
  }
  if (!isSupabasePublishableKey(publishableKey)) {
    throw new Error(
      "Invalid VITE_SUPABASE_PUBLISHABLE_KEY format. Use a Supabase publishable key (sb_publishable_...) or a legacy JWT anon key."
    );
  }
  const resolvedSupabaseUrl = parsed.data.VITE_SUPABASE_URL
    ? stripTrailingSlash(parsed.data.VITE_SUPABASE_URL.trim())
    : parsed.data.VITE_SUPABASE_PROJECT_ID
      ? `https://${parsed.data.VITE_SUPABASE_PROJECT_ID}.supabase.co`
      : null;

  if (!resolvedSupabaseUrl) {
    throw new Error(
      "Missing Supabase API URL. Set VITE_SUPABASE_URL or VITE_SUPABASE_PROJECT_ID."
    );
  }

  const urlProjectRef = extractProjectRefFromUrl(resolvedSupabaseUrl);
  const keyProjectRef = extractProjectRefFromPublishableKey(publishableKey);
  const configuredProjectId = parsed.data.VITE_SUPABASE_PROJECT_ID ?? null;

  if (configuredProjectId && urlProjectRef && configuredProjectId !== urlProjectRef) {
    // eslint-disable-next-line no-console
    console.error(
      "Supabase config mismatch: VITE_SUPABASE_PROJECT_ID does not match VITE_SUPABASE_URL."
    );
  }

  if (urlProjectRef && keyProjectRef && urlProjectRef !== keyProjectRef) {
    // eslint-disable-next-line no-console
    console.error(
      "Supabase config mismatch: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY belong to different projects."
    );
  }

  return {
    VITE_SUPABASE_URL: resolvedSupabaseUrl,
    VITE_SUPABASE_PROJECT_ID: configuredProjectId ?? urlProjectRef ?? keyProjectRef ?? undefined,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
})();
