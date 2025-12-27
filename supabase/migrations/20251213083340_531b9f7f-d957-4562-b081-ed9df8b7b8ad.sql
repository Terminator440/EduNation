-- Legacy schema migration (initial scaffold)
--
-- This project now uses 20251212000000_bootstrap_schema.sql to create the core schema
-- in an idempotent way (including the app_role enum and core tables).
--
-- Keeping this migration as a no-op prevents conflicts when resetting the local
-- database (e.g., "type app_role already exists").

SELECT 1;
