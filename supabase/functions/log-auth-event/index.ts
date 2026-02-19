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

    const { error } = await supabase.rpc("log_login", {
      p_user_id: user_id ?? null,
      p_email: email,
      p_success: success,
      p_ip_address: ip_address ?? null,
      p_user_agent: user_agent ?? null,
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
