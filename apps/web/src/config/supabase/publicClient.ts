import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

// Cookie-free Supabase client for public, unauthenticated reads (event
// listings, search, event details). Unlike server.ts, this never touches
// next/headers' cookies(), which in the App Router is what forces a route
// into per-request dynamic rendering — so Server Components/Actions that
// only use this client can be statically generated / ISR'd instead.
//
// Only safe for data that doesn't depend on who's asking: RLS is enabled on
// most tables (see the 2026-08-25 enable_rls_* migrations), but the RPCs
// this client calls (get_nearby_events, get_filtered_events,
// get_similar_events) are GRANTed to the `anon` role and never reference
// auth.uid(), so the anon key returns identical rows to the cookie-based
// client regardless of RLS. Don't reuse this for anything that checks
// supabase.auth.getUser() or needs the caller's identity.
export const publicSupabase = createClient(supabaseUrl, supabaseAnonKey);
