/**
 * Rate limiting: login attempts. Uses Supabase RPC check_login_rate_limit, record_login_attempt.
 */
import { supabase } from "@/integrations/supabase/client";

export async function checkLoginRateLimit(identifier: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("check_login_rate_limit", {
      p_identifier: identifier,
    });
    if (error) return true; // allow on error (e.g. table missing)
    return data === true;
  } catch {
    // Network/API outage should not crash login flow before auth attempt.
    return true;
  }
}

export async function recordLoginAttempt(identifier: string, success: boolean): Promise<void> {
  try {
    await supabase.rpc("record_login_attempt", {
      p_identifier: identifier,
      p_success: success,
    });
  } catch {
    // Best effort only; never break login UX when telemetry write fails.
  }
}
