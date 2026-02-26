#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve4 } from "node:dns/promises";

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

async function main() {
  const envRaw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const env = parseDotEnv(envRaw);

  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const configuredProjectId = env.VITE_SUPABASE_PROJECT_ID?.trim() ?? "";
  const supabaseUrl =
    env.VITE_SUPABASE_URL?.trim() ||
    (configuredProjectId ? `https://${configuredProjectId}.supabase.co` : "");

  const issues = [];

  if (!supabaseUrl) {
    issues.push("Lipsește VITE_SUPABASE_URL (sau fallback VITE_SUPABASE_PROJECT_ID).");
  }
  if (!publishableKey) {
    issues.push("Lipsește VITE_SUPABASE_PUBLISHABLE_KEY.");
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

  if (configuredProjectId && urlProjectRef && configuredProjectId !== urlProjectRef) {
    issues.push(
      `Project mismatch: VITE_SUPABASE_PROJECT_ID=${configuredProjectId} dar URL ref=${urlProjectRef}.`
    );
  }

  if (urlProjectRef && keyProjectRef && urlProjectRef !== keyProjectRef) {
    issues.push(
      `Project mismatch: URL ref=${urlProjectRef} dar anon key ref=${keyProjectRef}.`
    );
  }

  if (parsedUrl) {
    const host = parsedUrl.hostname;
    try {
      await resolve4(host);
      console.log(`DNS OK pentru host: ${host}`);
    } catch {
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
