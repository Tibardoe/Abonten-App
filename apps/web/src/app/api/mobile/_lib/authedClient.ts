import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Request-scoped Supabase client for the mobile HTTP API.
//
// The web app authenticates Server Actions with an SSR cookie session
// (src/config/supabase/server.ts). A mobile client has no cookies — it holds
// the Supabase access/refresh tokens in expo-secure-store and sends the
// access token as `Authorization: Bearer <jwt>` on every request.
//
// Setting that same header on a plain supabase-js client means BOTH
// `auth.getUser()` (validates the JWT against the auth server) AND PostgREST
// (so RLS sees `auth.uid()`) behave exactly as they do for a cookie session.
// No new trust model — just a different transport for the same token.
//
// Only the already-public URL + anon key are used here; no service-role key,
// nothing secret. Anything needing service-role stays in its own action
// behind an independent identity check (see serviceClient.ts).

type MobileAuth =
  | {
      supabase: SupabaseClient;
      user: { id: string; email?: string };
      response: null;
    }
  | { supabase: null; user: null; response: NextResponse };

function bearerFrom(req: Request): string | null {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function anonKeys(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  return { url, key };
}

const SERVER_AUTH_OPTIONS = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
} as const;

export function createBearerClient(accessToken: string): SupabaseClient {
  const { url, key } = anonKeys();

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: SERVER_AUTH_OPTIONS,
  });
}

/**
 * Session-less anon client for pre-login flows (e.g. consuming the phone
 * one-time password with `signInWithPassword` to read back the resulting
 * session tokens). Never persists or refreshes anything.
 */
export function createAnonClient(): SupabaseClient {
  const { url, key } = anonKeys();

  return createClient(url, key, { auth: SERVER_AUTH_OPTIONS });
}

/**
 * Resolves the caller of a mobile API route. On success returns a
 * Bearer-scoped `supabase` client and the authenticated `user`. On failure
 * returns a ready-to-send `401` `response` and null client/user — the route
 * handler just does `if (auth.response) return auth.response;`.
 */
export async function getMobileAuth(req: Request): Promise<MobileAuth> {
  const token = bearerFrom(req);

  if (!token) {
    return {
      supabase: null,
      user: null,
      response: NextResponse.json(
        { status: 401, message: "Missing bearer token" },
        { status: 401 },
      ),
    };
  }

  const supabase = createBearerClient(token);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase: null,
      user: null,
      response: NextResponse.json(
        { status: 401, message: "Invalid or expired session" },
        { status: 401 },
      ),
    };
  }

  return {
    supabase,
    user: { id: user.id, email: user.email },
    response: null,
  };
}
