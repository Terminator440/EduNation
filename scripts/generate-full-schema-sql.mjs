#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const migrationsDir = resolve("supabase/migrations");
const outputPath = resolve("supabase/scripts/create_full_schema_from_migrations.sql");

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

if (migrationFiles.length === 0) {
  console.error("Nu am găsit migrații SQL în supabase/migrations.");
  process.exit(1);
}

const generatedAt = new Date().toISOString();

const chunks = [];
chunks.push("-- ===========================================================================");
chunks.push("-- AUTO-GENERATED FILE - DO NOT EDIT MANUALLY");
chunks.push("--");
chunks.push("-- This file concatenates all SQL migrations in lexical order.");
chunks.push("-- Source directory: supabase/migrations");
chunks.push(`-- Generated at: ${generatedAt}`);
chunks.push(`-- Total migrations: ${migrationFiles.length}`);
chunks.push("--");
chunks.push("-- Usage:");
chunks.push("--   - Preferred: run migrations through Supabase migration flow.");
chunks.push("--   - Alternative: run this file on an empty database to bootstrap schema.");
chunks.push("-- ===========================================================================");
chunks.push("");

for (const [idx, file] of migrationFiles.entries()) {
  const content = readFileSync(join(migrationsDir, file), "utf8").replace(/\r\n/g, "\n");
  chunks.push("-- ---------------------------------------------------------------------------");
  chunks.push(`-- MIGRATION ${idx + 1}/${migrationFiles.length}: ${file}`);
  chunks.push("-- ---------------------------------------------------------------------------");
  chunks.push(content.trimEnd());
  chunks.push("");
  chunks.push("");
}

writeFileSync(outputPath, `${chunks.join("\n").trimEnd()}\n`, "utf8");
console.log(`Generated ${outputPath} with ${migrationFiles.length} migrations.`);
