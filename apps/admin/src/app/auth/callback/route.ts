import { STEP_UP_COOKIE_NAME } from "@/lib/adminGuard";
import { createSsrClient } from "@/lib/supabaseServer";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { NextResponse } from "next/server";

// OAuth PKCE callback: exchange the code for a session cookie, then land on
// the console (which itself enforces the allowlist + admin_user check).
// `stepup=1` means this round-trip was a deliberate re-authentication for a
// sensitive action — stamp the step-up cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const stepup = url.searchParams.get("stepup") === "1";

  if (code) {
    const supabase = await createSsrClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(new URL(next, url.origin));
      if (stepup) {
        res.cookies.set(STEP_UP_COOKIE_NAME, String(Date.now()), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: Math.floor(STEP_UP_MAX_AGE_MS / 1000),
        });
      }
      return res;
    }
  }
  return NextResponse.redirect(new URL("/auth/signin", url.origin));
}
