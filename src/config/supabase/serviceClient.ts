import { type SupabaseClient, createClient } from "@supabase/supabase-js";

// Cookie-free, service-role Supabase client — used ONLY by the Paystack
// webhook route (src/app/api/paystack/webhook/route.ts), which has no
// browser session/cookies to authenticate with (Paystack calls it directly,
// server-to-server). Authorization for that route comes from verifying the
// Paystack webhook signature, not from a Supabase user session — this
// client is what lets the verified webhook write payment/ticket state on
// the paying user's behalf.
//
// Never import this into a "use client" file or any code path reachable
// without independent authorization — SUPABASE_SERVICE_ROLE_KEY bypasses
// whatever RLS may exist. This module must stay server-only.
//
// Built lazily (only on first actual use, not at module load) so that
// `next build`'s route data collection doesn't fail before
// SUPABASE_SERVICE_ROLE_KEY has been configured — the webhook route itself
// is what needs this value, not the build.
let cachedClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase service-role environment variables (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
}
