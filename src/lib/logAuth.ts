/**
 * Log login events to login_logs via Edge Function (log-auth-event).
 * Fire-and-forget; used after signIn success/failure.
 */

import { env } from "@/lib/env";

export interface LogLoginParams {
  user_id?: string | null;
  email: string;
  success: boolean;
  user_agent?: string | null;
}

const LOG_AUTH_URL = `${env.VITE_SUPABASE_URL}/functions/v1/log-auth-event`;

export function logLoginEvent(params: LogLoginParams): Promise<void> {
  return fetch(LOG_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      user_id: params.user_id ?? null,
      email: params.email,
      success: params.success,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }),
  }).then(() => undefined);
}
