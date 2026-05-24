/**
 * Edge Function: log auth events (login success/failure) to login_logs.
 * Invoke from Supabase Auth Hook (Dashboard > Auth > Hooks) or from client after signIn.
 * Uses service_role to insert into login_logs (authenticated users cannot INSERT).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LogLoginBody {
  user_id?: string | null;
  email: string;
  success: boolean;
  ip_address?: string | null;
  user_agent?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as LogLoginBody;
    const { user_id, email, success, ip_address, user_agent } = body;

    if (email == null || success === undefined) {
      return new Response(
        JSON.stringify({ error: "email and success are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NOTE (security): this endpoint is publicly callable (failed logins have no
    // session). To prevent abuse it should ideally be wired as a Supabase Auth
    // Hook (server-to-server) rather than called from the client. As defense in
    // depth we validate/cap the input so the audit table cannot be flooded with
    // oversized or malformed rows.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = String(email).trim().toLowerCase().slice(0, 320);
    if (!EMAIL_RE.test(normalizedEmail)) {
      return new Response(
        JSON.stringify({ error: "invalid email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeUserId = typeof user_id === "string" && UUID_RE.test(user_id) ? user_id : null;
    const safeUserAgent =
      typeof user_agent === "string" ? user_agent.slice(0, 512) : null;
    const safeIp = typeof ip_address === "string" ? ip_address.slice(0, 64) : null;

    const { error } = await supabase.rpc("log_login", {
      p_user_id: safeUserId,
      p_email: normalizedEmail,
      p_success: Boolean(success),
      p_ip_address: safeIp,
      p_user_agent: safeUserAgent,
    });

    if (error) {
      console.error("log_login error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("log-auth-event error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
