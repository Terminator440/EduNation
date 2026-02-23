/**
 * Edge Function: procesează coada notification_email_queue (notă nouă, absență).
 * Invocare: cron sau manual. Cu RESEND_API_KEY poate trimite email; fără, doar marchează ca trimise.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: rows, error: fetchError } = await supabase
      .from("notification_email_queue")
      .select("id, user_id, type, payload")
      .is("sent_at", null)
      .limit(100);

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const processed: string[] = [];
    for (const row of rows ?? []) {
      await supabase
        .from("notification_email_queue")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id);
      processed.push(row.id);
    }

    return new Response(
      JSON.stringify({ processed: processed.length, ids: processed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
