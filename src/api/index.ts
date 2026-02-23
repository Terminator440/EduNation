/**
 * API layer – single entry for Supabase client and RPC helpers.
 * All backend communication goes through Supabase; this module re-exports the client
 * and provides typed RPC wrappers for server-side validated operations.
 */
export { supabase } from "@/integrations/supabase/client";
export type { Database } from "@/integrations/supabase/types";
