import { type SupabaseClient, createClient } from "@supabase/supabase-js";

// Cookie-free, service-role Supabase client. Originally added for the
// Paystack webhook route (src/app/api/paystack/webhook/route.ts), which has
// no browser session/cookies to authenticate with (Paystack calls it
// directly, server-to-server) -- authorization there comes from verifying
// the Paystack webhook signature, not a Supabase user session.
//
// Also now used by the phone-auth Server Actions that need Admin API access
// auth.getUser() can't provide: verifyPhoneSignIn.ts (find-or-create user by
// phone, mint session), updateVerifiedPhone.ts (attach a verified phone to
// the current user), deleteUser.ts (admin.deleteUser), and
// ensureProfileCompletionNotification.ts (runs before any session cookie
// exists). Every one of those call sites independently checks
// auth.getUser() or otherwise proves the caller's identity before using
// this client -- it is never reachable from an unauthenticated request path.
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
