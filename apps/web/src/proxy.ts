import type { NextRequest } from "next/server";
import { updateSession } from "./config/supabase/middleware";
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME } from "./i18n/config";
import { getPreferredLocale } from "./i18n/negotiateLocale";

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  // Get stored country from cookies
  const storedCountry = request.cookies.get("country")?.value;

  // Determine current country
  const currentCountry = (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("x-country-code") ??
    "GH"
  ).toUpperCase();

  if (!storedCountry || storedCountry !== currentCountry) {
    response.cookies.set("country", currentCountry, {
      path: "/",
      httpOnly: false, // allow client access if needed
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
  }

  // Only set the locale cookie on first visit — never overwrite an
  // explicit choice the user already made via Language Settings.
  const storedLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;

  if (!storedLocale) {
    const preferredLocale = getPreferredLocale(
      request.headers.get("accept-language"),
    );

    response.cookies.set(LOCALE_COOKIE_NAME, preferredLocale, {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: LOCALE_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/mobile (the native app's HTTP API — Bearer-token auth via
     *   getMobileAuth, not the cookie session this middleware refreshes;
     *   without this exclusion every /api/mobile/** request from the app
     *   is 302'd to /auth/signin because it carries no Supabase cookie)
     * Feel free to modify this pattern to include more paths.
     */
    // "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/((?!_next/static|_next/image|favicon.ico|api/mobile|api/observability|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
    //  '/((?!api|trpc|_next|_vercel|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
