import { type SupabaseClient, createClient } from "@supabase/supabase-js";

// Service-role Supabase client for the admin console. Bypasses RLS — every
// call site must have already run resolveAdminContext() to authorize the
// human behind the request. This module is server-only; never import it
// from a "use client" file.
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for apps/admin",
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
