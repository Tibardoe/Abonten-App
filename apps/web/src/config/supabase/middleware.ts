import { createHash } from "node:crypto";
import { createRecentCache } from "@abonten/core/recentCache";
import {
  ACCOUNT_RESTRICTED_ACTION_CODE,
  ACTION_REFUSAL_CONTENT_TYPE,
} from "@abonten/core/security/actionRefusal";
import type { Database } from "@abonten/types/database.types";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// A session the auth server confirmed a moment ago, remembered by this
// server instance for half a minute (by a hash of its access token, never
// the token itself).
//
// One page of a private section is many requests: the page, and a request
// for each segment of every link the browser prefetches (59 of them on
// Settings). Each used to be confirmed with its own round trip to the
// auth server. The first one is; the rest of the burst reuse its answer.
// Thirty seconds is short against what the answer protects: a session that
// is revoked is already valid until its access token runs out, and pages
// and Server Actions still confirm the user themselves before showing or
// changing anything. Whether the account is restricted is remembered the
// same way for page requests, and read afresh for every Server Action.
const CONFIRMED = { ttlMs: 30_000, limit: 5_000 };
const confirmedUsers = createRecentCache<string>(CONFIRMED);
// user_info.status_id as last read for a page request (null: no row).
const accountStatuses = createRecentCache<number | null>(CONFIRMED);

const tokenKey = (accessToken: string) =>
  createHash("sha256").update(accessToken).digest("base64url");

// Sections that need a signed-in session. Kept alphabetical; add a prefix
// here when a new private area is created (and give it a noindex layout).
const PROTECTED_PREFIXES = [
  "/admin",
  "/checkout",
  "/consent",
  "/field",
  "/finances",
  "/for-you",
  "/manage",
  "/messages",
  "/notifications",
  "/plans",
  "/rewards",
  "/settings",
  "/transactions",
  "/user-account",
  "/wallet",
] as const;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({
          request,
        });

        for (const { name, value } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value);
        }
      },
    },
  });

  // Do not run code between createServerClient and the auth call below
  // (getUser() or getSession()). A simple mistake could make it very hard
  // to debug issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE the auth call: it is what refreshes an expired
  // access token and writes the new cookies onto the response.

  const pathname = request.nextUrl.pathname;

  // Route protection is an explicit list of PRIVATE sections. Everything
  // else — discovery, listings, profiles, help, legal, share links and any
  // URL that does not exist — is served without a session, so a mistyped
  // link gets the site's 404 page instead of a bounce to sign-in, and a
  // pre-login call to /api/geocode is not redirected to an HTML page. The
  // list is the second gate, not the only one: every page and Server
  // Action under these prefixes re-checks auth.getUser() itself, and the
  // private layouts are marked noindex.
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  // Push-click and email-link landing: marks the notification read when
  // signed in, then redirects; the target page applies its own rules.
  const isPublicRoute = !isProtectedRoute || pathname === "/notifications/open";

  // A Server Action can be POSTed to ANY path — an event page, the home
  // page — not only to the private section it belongs to, so action calls
  // are checked wherever they land (before 2026-09-25 a restricted account
  // could reach every action through a public page).
  const isServerAction =
    request.method === "POST" && request.headers.has("next-action");

  // Who is asking has to be CONFIRMED (getUser(): a round trip to the auth
  // server) only where this file decides something by it: a private
  // section, or a Server Action. Everywhere else the proxy's one job is to
  // keep the session cookie fresh, and getSession() does exactly that: it
  // reads the cookie and refreshes the tokens when the access token has
  // run out, with no network call otherwise.
  //
  // Until 2026-10-02 every request confirmed the user: a signed-in person
  // opening one Explore page caused about fifty calls to the auth server
  // (the page, each link the browser prefetched, each Server Action), all
  // of them for pages that are public. Nothing is decided here from an
  // unconfirmed session: public pages and their data re-check
  // auth.getUser() themselves wherever they show something personal.
  let user: { id: string } | null = null;
  // getSession() first in both cases: it is what refreshes the tokens, and
  // it gives the access token the confirmation is remembered by.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if ((!isPublicRoute || isServerAction) && session?.access_token) {
    const key = tokenKey(session.access_token);
    const known = confirmedUsers.get(key);
    if (known) {
      user = { id: known };
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
      if (data.user) confirmedUsers.set(key, data.user.id);
    }
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    // .clone() carries over the original request's query string (e.g.
    // ?tab=orders) -- clear it before setting `next`, otherwise it leaks
    // onto /auth/signin as redundant top-level params alongside the
    // already-encoded copy inside `next` itself.
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // A signed-in but suspended (status_id 2) / banned (status_id 3) account
  // is bounced off every protected route to the restriction landing. One
  // indexed PK read, only on authenticated non-public requests. An admin
  // ban also revokes their Supabase sessions (setUserStatusCore); this
  // closes the window before the JWT expires and covers server-rendered
  // pages + Server Actions (both pass through this middleware). Fails open.
  //
  // A Server Action always asks the database. A page reuses an answer up
  // to half a minute old: the 34 requests one Settings page makes (itself
  // and its prefetched links) were 34 reads of the same row.
  if (user && (!isPublicRoute || isServerAction)) {
    const key = tokenKey(session?.access_token ?? "");
    let statusId = isServerAction ? undefined : accountStatuses.get(key);
    if (statusId === undefined) {
      // One attempt. The data client repeats a failed read by itself (three
      // more times over seven seconds), which is right for a page's data and
      // wrong here: this check fails open, and while the database was
      // unreachable it added seven seconds to every Server Action.
      const { data: statusRow, error: statusError } = await supabase
        .from("user_info")
        .select("status_id")
        .eq("id", user.id)
        .retry(false)
        .maybeSingle();
      statusId = statusRow?.status_id ?? null;
      // Only an answer is remembered: a read that failed is asked again by
      // the next request, not trusted for half a minute.
      if (!statusError) accountStatuses.set(key, statusId);
    }

    // status_id 4 is a deleted (anonymised) account -- its sessions are
    // revoked on deletion, this only closes the window before the JWT
    // expires.
    if (statusId === 2 || statusId === 3 || statusId === 4) {
      if (isServerAction) {
        // A code, as plain text: the only refusal the framework's browser
        // code hands on to the caller, which words it in the reader's
        // language (@abonten/core/security/actionRefusal).
        return new NextResponse(ACCOUNT_RESTRICTED_ACTION_CODE, {
          status: 403,
          headers: { "content-type": ACTION_REFUSAL_CONTENT_TYPE },
        });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/account-restricted";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
