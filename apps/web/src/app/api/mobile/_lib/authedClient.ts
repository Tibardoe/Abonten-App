import { recordDeviceInstallCore } from "@abonten/services/rewards/referralCore";
import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { NextResponse, after } from "next/server";

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
      supabase: SupabaseClient<Database>;
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

export function createBearerClient(
  accessToken: string,
): SupabaseClient<Database> {
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
export function createAnonClient(): SupabaseClient<Database> {
  const { url, key } = anonKeys();

  return createClient(url, key, { auth: SERVER_AUTH_OPTIONS });
}

/**
 * The `sub` claim of a JWT, read WITHOUT verifying the signature.
 *
 * Used only to start the account-status read concurrently with the real
 * verification below — never as proof of identity. The value is discarded
 * unless `auth.getUser()` independently returns the same id, and the read
 * it feeds runs under the caller's own Bearer token (so RLS applies to it
 * exactly as it would to any other request).
 */
function unverifiedSubject(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

type StatusRow = { status_id: number } | null;

async function readAccountStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<StatusRow> {
  // PostgREST builders are thenable but not real Promises, so this has to be
  // awaited inside an async function for the caller to get something with
  // .catch() on it.
  const { data } = await supabase
    .from("user_info")
    .select("status_id")
    .eq("id", userId)
    .maybeSingle();
  return data as StatusRow;
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

  // These two are the fixed cost of EVERY authenticated mobile request, and
  // they used to run back to back — two serial Vercel->Supabase round trips
  // before the handler started. They don't depend on each other: the status
  // read only needs an id, and the JWT already carries one. Firing both at
  // once and reconciling afterwards measured ~513ms -> ~321ms per request.
  const claimedId = unverifiedSubject(token);
  const statusPromise = claimedId
    ? readAccountStatus(supabase, claimedId).catch(() => null)
    : null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    // Settle the speculative read so a rejected request never leaves an
    // unhandled rejection behind.
    void statusPromise;
    return {
      supabase: null,
      user: null,
      response: NextResponse.json(
        { status: 401, message: "Invalid or expired session" },
        { status: 401 },
      ),
    };
  }

  // Block a suspended (status_id 2) or banned (status_id 3) account from
  // every mobile API route in one place — an admin ban also revokes their
  // Supabase sessions (see setUserStatusCore), this covers the window
  // before their JWT expires. Fails open on a lookup error so a transient
  // read failure never locks the whole app out.
  //
  // The speculative read is only trusted when the verified id matches the
  // id it was issued for; otherwise it is thrown away and re-read against
  // the id `auth.getUser()` actually confirmed.
  const statusRow =
    claimedId === user.id && statusPromise
      ? await statusPromise
      : await readAccountStatus(supabase, user.id).catch(() => null);

  if (statusRow && (statusRow.status_id === 2 || statusRow.status_id === 3)) {
    return {
      supabase: null,
      user: null,
      response: NextResponse.json(
        {
          status: 403,
          message:
            "Your account has been restricted. Contact support if you think this is a mistake.",
        },
        { status: 403 },
      ),
    };
  }

  // Which app install this account uses (Rewards fraud signal: the same
  // install on a referrer's and a buyer's account). After the response,
  // throttled, never blocking.
  const installId = req.headers.get("x-abonten-install-id");
  if (installId) {
    const platform =
      req.headers.get("x-abonten-platform") === "ios" ? "ios" : "android";
    after(() => recordDeviceInstallCore(installId, user.id, platform));
  }

  return {
    supabase,
    user: { id: user.id, email: user.email },
    response: null,
  };
}
