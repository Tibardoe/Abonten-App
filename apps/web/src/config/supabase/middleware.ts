import type { Database } from "@abonten/types/database.types";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

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

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/events") ||
    pathname.startsWith("/places") ||
    pathname.startsWith("/explore") ||
    // "/user/" (trailing slash) so this only matches /user/[username]/...
    // profile sub-routes -- not "/user-account" (Settings), which needs auth.
    pathname.startsWith("/user/") ||
    pathname.startsWith("/reviews") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/auth") ||
    // Friend invite landing (Abonten Rewards) -- for people who aren't
    // signed up yet.
    pathname.startsWith("/invite/") ||
    // The unsubscribe page linked from Abonten Rewards emails -- works
    // without signing in (the link carries a signed token).
    pathname.startsWith("/unsubscribe/") ||
    // The "your account is restricted" landing itself — must stay reachable
    // for a signed-in-but-banned user so the redirect below can't loop.
    pathname.startsWith("/account-restricted") ||
    // Digital Asset Links / Apple App Site Association — must be publicly
    // fetchable (by Google/Apple's verifiers and by curl) for Android App
    // Links + iOS Universal Links to verify. Without this the middleware
    // 302s the unauthenticated fetch to /auth/signin.
    pathname.startsWith("/.well-known/");

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
  if (user && !isPublicRoute) {
    const { data: statusRow } = await supabase
      .from("user_info")
      .select("status_id")
      .eq("id", user.id)
      .maybeSingle();

    if (statusRow && (statusRow.status_id === 2 || statusRow.status_id === 3)) {
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
