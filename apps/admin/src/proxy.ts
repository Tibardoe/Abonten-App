import { buildAdminCsp } from "@abonten/core/security/contentSecurityPolicy";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Next.js 16's renamed middleware. Refreshes the Supabase auth cookie on
// every request and bounces unauthenticated visitors to sign-in. This is
// only the first gate — every page + server action also calls requireAdmin()
// (email allowlist + resolveAdminContext) server-side.
const CONTENT_SECURITY_POLICY = buildAdminCsp({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  development: process.env.NODE_ENV === "development",
  vercelPreview: process.env.NEXT_PUBLIC_VERCEL_ENV === "preview",
});

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string }[]) {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value } of cookiesToSet)
          response.cookies.set(name, value);
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname.startsWith("/auth") ||
    pathname === "/no-access" ||
    pathname.startsWith("/api/observability");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const signin = request.nextUrl.clone();
    signin.pathname = "/auth/signin";
    signin.search = "";
    signin.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(signin);
  }

  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
