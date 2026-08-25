import { createClient } from "@/config/supabase/server";
import { getSafeRedirectPath } from "@/utils/getSafeRedirectPath";
import { type NextRequest, NextResponse } from "next/server";

// Exchanges the Google OAuth code for a session *server-side* before
// redirecting to `next`. This must happen here rather than on the
// destination page: `next/proxy.ts` -> middleware.ts runs on every request,
// including the very first one back from Google (which only carries
// `?code=...`, no session cookie yet). For any non-public route, middleware
// would see no user and bounce straight back to /auth/signin, discarding
// the code before client-side JS ever gets a chance to exchange it.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next =
    getSafeRedirectPath(searchParams.get("next") ?? undefined) ?? "/explore";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Surface the failure instead of silently dropping it. Two distinct
    // cases land here: a plain failed sign-in (no session), or a failed
    // linkIdentity() completion (e.g. "this Google account is already
    // linked to another user") -- which happens to an *already signed-in*
    // user, so their existing session is untouched by the failure. Route
    // each back to where it can actually be shown: `next` (e.g.
    // /settings/security) for the still-authenticated linking case, since
    // redirecting a signed-in user to /auth/signin would be a dead end;
    // /auth/signin otherwise, same as before.
    const { data: userData } = await supabase.auth.getUser();
    const destination = new URL(
      userData.user
        ? `${origin}${next}`
        : `${origin}/auth/signin?next=${encodeURIComponent(next)}`,
    );
    destination.searchParams.set("authError", error.message);
    return NextResponse.redirect(destination);
  }

  return NextResponse.redirect(
    `${origin}/auth/signin?next=${encodeURIComponent(next)}`,
  );
}
