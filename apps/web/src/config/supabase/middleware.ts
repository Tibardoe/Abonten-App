import type { Database } from "@abonten/types/database.types";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

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

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  // A Server Action can be POSTed to ANY path — an event page, the home
  // page — not only to the private section it belongs to, so action calls
  // are checked wherever they land (before 2026-09-25 a restricted account
  // could reach every action through a public page).
  const isServerAction =
    request.method === "POST" && request.headers.has("next-action");
  if (user && (!isPublicRoute || isServerAction)) {
    const { data: statusRow } = await supabase
      .from("user_info")
      .select("status_id")
      .eq("id", user.id)
      .maybeSingle();

    // status_id 4 is a deleted (anonymised) account -- its sessions are
    // revoked on deletion, this only closes the window before the JWT
    // expires.
    if (
      statusRow &&
      (statusRow.status_id === 2 ||
        statusRow.status_id === 3 ||
        statusRow.status_id === 4)
    ) {
      if (isServerAction) {
        return NextResponse.json(
          {
            status: 403,
            message:
              "Your account has been restricted. Contact support if you think this is a mistake.",
          },
          { status: 403 },
        );
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
