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
    getSafeRedirectPath(searchParams.get("next") ?? undefined) ?? "/events";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/auth/signin?next=${encodeURIComponent(next)}`,
  );
}
