/**
 * Export database data as JSON for backup.
 * Run with: npx ts-node --esm scripts/export-backup.ts
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env (or .env).
 *
 * Output: backup-YYYY-MM-DD-HHmm.json in project root (or path from BACKUP_OUTPUT env).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_OUTPUT =
  process.env.BACKUP_OUTPUT ?? `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-").replace(/-$/, "")}.json`;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) in environment.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const tables = [
    "schools",
    "school_years",
    "classes",
    "subjects",
    "profiles",
    "user_roles",
    "students",
    "grades",
    "attendance",
    "invitations",
    "parent_student_relations",
  ] as const;

  const backup: Record<string, unknown[]> = {};
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      console.warn(`Warning: ${table} - ${error.message}`);
      backup[table] = [];
    } else {
      backup[table] = data ?? [];
    }
  }

  const fs = await import("fs");
  fs.writeFileSync(BACKUP_OUTPUT, JSON.stringify(backup, null, 2), "utf-8");
  console.log(`Backup written to ${BACKUP_OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
