#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve4, resolve6 } from "node:dns/promises";

function parseDotEnv(rawContent) {
  const values = {};

  for (const rawLine of rawContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIdx = line.indexOf("=");
    if (separatorIdx <= 0) continue;

    const key = line.slice(0, separatorIdx).trim();
    let value = line.slice(separatorIdx + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function getProjectRefFromUrl(supabaseUrl) {
  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getProjectRefFromAnonKey(publishableKey) {
  try {
    const [, payload] = publishableKey.split(".");
    if (!payload) return null;

    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload =
      normalizedPayload + "=".repeat((4 - (normalizedPayload.length % 4)) % 4);
    const decodedPayload = JSON.parse(Buffer.from(paddedPayload, "base64").toString("utf8"));
    return typeof decodedPayload.ref === "string" ? decodedPayload.ref : null;
  } catch {
    return null;
  }
}

function getProjectRefFromDbUrl(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    const host = parsed.hostname.toLowerCase();

    const directMatch = host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
    if (directMatch) return directMatch[1];

    // Pooler URLs are region-based; project ref is encoded in username: postgres.<project_ref>
    if (host.endsWith(".pooler.supabase.com")) {
      const username = decodeURIComponent(parsed.username || "");
      const userMatch = username.match(/^[^.]+\.([a-z0-9]{20})$/);
      if (userMatch) return userMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

async function canResolveHost(host) {
  try {
    await resolve4(host);
    return true;
  } catch {
    try {
      await resolve6(host);
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  const envRaw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const env = parseDotEnv(envRaw);

  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const configuredProjectId = env.VITE_SUPABASE_PROJECT_ID?.trim() ?? "";
  const dbUrl = env.SUPABASE_DB_URL?.trim() || env.DATABASE_URL?.trim() || "";
  const supabaseUrl =
    env.VITE_SUPABASE_URL?.trim() ||
    (configuredProjectId ? `https://${configuredProjectId}.supabase.co` : "");

  const issues = [];

  if (!supabaseUrl) {
    issues.push("Lipsește VITE_SUPABASE_URL (sau fallback VITE_SUPABASE_PROJECT_ID).");
  }
  if (!publishableKey) {
    issues.push("Lipsește VITE_SUPABASE_PUBLISHABLE_KEY.");
  } else if (publishableKey.includes("REPLACE_WITH_")) {
    issues.push("VITE_SUPABASE_PUBLISHABLE_KEY este placeholder. Înlocuiește cu anon key real.");
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    issues.push(`VITE_SUPABASE_URL invalid: ${supabaseUrl}`);
  }

  const urlProjectRef = getProjectRefFromUrl(supabaseUrl);
  const keyProjectRef = getProjectRefFromAnonKey(publishableKey);
  const dbProjectRef = dbUrl ? getProjectRefFromDbUrl(dbUrl) : null;

  if (configuredProjectId && urlProjectRef && configuredProjectId !== urlProjectRef) {
    issues.push(
      `Project mismatch: VITE_SUPABASE_PROJECT_ID=${configuredProjectId} dar URL ref=${urlProjectRef}.`
    );
  }

  if (!keyProjectRef) {
    issues.push("VITE_SUPABASE_PUBLISHABLE_KEY nu pare un JWT valid (anon key Supabase).");
  }

  if (urlProjectRef && keyProjectRef && urlProjectRef !== keyProjectRef) {
    issues.push(
      `Project mismatch: URL ref=${urlProjectRef} dar anon key ref=${keyProjectRef}.`
    );
  }

  if (dbUrl && !dbProjectRef) {
    issues.push("SUPABASE_DB_URL/DATABASE_URL nu conține un project_ref Supabase valid.");
  }

  if (dbProjectRef && configuredProjectId && dbProjectRef !== configuredProjectId) {
    issues.push(
      `Project mismatch: DB ref=${dbProjectRef} dar VITE_SUPABASE_PROJECT_ID=${configuredProjectId}.`
    );
  }

  if (dbProjectRef && urlProjectRef && dbProjectRef !== urlProjectRef) {
    issues.push(
      `Project mismatch: DB ref=${dbProjectRef} dar URL ref=${urlProjectRef}.`
    );
  }

  if (parsedUrl) {
    const host = parsedUrl.hostname;
    if (await canResolveHost(host)) {
      console.log(`DNS OK pentru host: ${host}`);
    } else {
      issues.push(
        `DNS resolution eșuat pentru ${host}. URL-ul proiectului Supabase pare invalid/dezactivat.`
      );
    }

    try {
      const healthUrl = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/health`;
      const response = await fetch(healthUrl, { method: "GET" });
      console.log(`Health check ${healthUrl} -> HTTP ${response.status}`);
      if (!response.ok) {
        issues.push(`Auth health endpoint a răspuns cu HTTP ${response.status}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`Nu s-a putut accesa endpoint-ul de health pentru Auth: ${message}`);
    }
  }

  if (dbUrl) {
    try {
      const dbHost = new URL(dbUrl).hostname;
      if (await canResolveHost(dbHost)) {
        console.log(`DNS OK pentru DB host: ${dbHost}`);
      } else {
        issues.push(`DNS resolution eșuat pentru DB host: ${dbHost}.`);
      }
    } catch {
      issues.push("SUPABASE_DB_URL/DATABASE_URL invalid (nu poate fi parsat ca URL).");
    }
  }

  if (issues.length > 0) {
    console.error("\nConfig Supabase INVALID:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log("\nConfig Supabase validă.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Eroare la verificare: ${message}`);
  process.exit(1);
});
