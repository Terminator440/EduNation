// Bulk Import Edge Function: creates auth.users + profiles + students/user_roles for validated rows.
// Requires JWT; resolves school_id from caller's profile. Only director/secretariat/uat_admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BulkImportRow {
  role: "student" | "teacher";
  email: string;
  full_name: string;
  cnp?: string | null;
  phone?: string | null;
  class_id?: string | null;
}

interface RowResult {
  rowIndex: number;
  success: boolean;
  error?: string;
  user_id?: string;
}

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Lipsă autorizare" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Token invalid sau expirat" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", caller.id)
      .single();
    const schoolId = profile?.school_id;
    if (!schoolId) {
      return new Response(
        JSON.stringify({ error: "Nu aveți o școală asociată" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const allowedRoles = ["director", "secretariat", "uat_admin"];
    const hasRole = (roles?.data ?? []).some((r) => allowedRoles.includes(r.role));
    if (!hasRole) {
      return new Response(
        JSON.stringify({ error: "Nu aveți dreptul de a importa utilizatori în masă" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const rows = (body?.rows ?? []) as (BulkImportRow & { rowIndex?: number })[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Body trebuie să conțină un array 'rows' nevid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: RowResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = row.rowIndex ?? i;
      const email = (row.email ?? "").trim();
      const full_name = (row.full_name ?? "").trim();
      const role = row.role === "teacher" ? "teacher" : "student";
      const class_id = row.role === "student" ? (row.class_id ?? null) : null;

      if (!email || !full_name) {
        results.push({ rowIndex, success: false, error: "Email sau nume lipsă" });
        continue;
      }
      if (role === "student" && !class_id) {
        results.push({ rowIndex, success: false, error: "Clasă lipsă pentru elev" });
        continue;
      }

      let newUserId: string | null = null;
      try {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: randomPassword(),
          email_confirm: true,
          user_metadata: { full_name },
        });
        if (createErr) {
          results.push({ rowIndex, success: false, error: createErr.message });
          continue;
        }
        newUserId = newUser?.user?.id ?? null;
        if (!newUserId) {
          results.push({ rowIndex, success: false, error: "Creare utilizator eșuată" });
          continue;
        }

        const { error: profileErr } = await supabaseAdmin.from("profiles").upsert(
          {
            id: newUserId,
            full_name,
            email,
            phone: row.phone ?? null,
            school_id: schoolId,
            cnp: row.cnp ?? null,
            active_role: role,
          },
          { onConflict: "id" }
        );
        if (profileErr) {
          results.push({ rowIndex, success: false, error: `Profil: ${profileErr.message}`, user_id: newUserId });
          continue;
        }

        const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
          user_id: newUserId,
          role: role === "student" ? "student" : "teacher",
        });
        if (roleErr) {
          results.push({ rowIndex, success: false, error: `Rol: ${roleErr.message}`, user_id: newUserId });
          continue;
        }

        if (role === "student" && class_id) {
          const { error: studentErr } = await supabaseAdmin.from("students").insert({
            user_id: newUserId,
            class_id,
            full_name,
            school_id: schoolId,
            is_active: true,
          });
          if (studentErr) {
            results.push({ rowIndex, success: false, error: `Student: ${studentErr.message}`, user_id: newUserId });
            continue;
          }
        }

        results.push({ rowIndex, success: true, user_id: newUserId });
      } catch (e) {
        results.push({ rowIndex, success: false, error: String(e) });
      }
    }

    const created = results.filter((r) => r.success).length;
    return new Response(
      JSON.stringify({ created, total: rows.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
