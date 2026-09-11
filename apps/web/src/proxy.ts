import { inviteCodeFromPath } from "@abonten/core/rewards/invite";
import {
  DEVICE_COOKIE_NAME,
  INVITE_FLAG_COOKIE_NAME,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
  addInviteToCookie,
  addTouchToCookie,
  referralKeyForPath,
} from "@abonten/services/rewards/referralCookie";
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

  // Abonten Rewards: remember a referral link (?ref=CODE) in a signed,
  // httpOnly cookie so the checkout can credit it. No database work here --
  // the code is validated when it's used. Never allowed to break a page.
  // A friend's invite (/invite/CODE) goes in the same cookie; it's bound to
  // the account after sign-in (InviteBinder). A `?ref=` link to a page that
  // isn't an event or place counts as an invite too.
  const ref = request.nextUrl.searchParams.get("ref");
  const inviteCode = inviteCodeFromPath(request.nextUrl.pathname);
  if (ref || inviteCode) {
    try {
      const current = request.cookies.get(REFERRAL_COOKIE_NAME)?.value;
      const next = inviteCode
        ? addInviteToCookie(current, inviteCode, Date.now())
        : addTouchToCookie(
            current,
            request.nextUrl.pathname,
            ref as string,
            Date.now(),
          );
      if (next) {
        const cookieOptions = {
          path: "/",
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const,
          maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
        };
        response.cookies.set(REFERRAL_COOKIE_NAME, next, {
          ...cookieOptions,
          httpOnly: true,
        });
        if (
          inviteCode ||
          referralKeyForPath(request.nextUrl.pathname) === "u"
        ) {
          response.cookies.set(INVITE_FLAG_COOKIE_NAME, "1", {
            ...cookieOptions,
            httpOnly: false,
          });
        }
      }
    } catch {
      // signing key unavailable -- skip capture
    }
  }

  // A random per-browser id, used only as a Rewards fraud signal (the same
  // browser on a referrer's and a buyer's account).
  if (!request.cookies.get(DEVICE_COOKIE_NAME)) {
    response.cookies.set(DEVICE_COOKIE_NAME, crypto.randomUUID(), {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 365 * 86_400,
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
     * - api/paystack/webhook (Paystack's server calling us directly, no
     *   Supabase cookie either — same failure mode as api/mobile above.
     *   Confirmed live 2026-09-06: every refund/charge webhook Paystack
     *   ever sent was silently 307'd to /auth/signin before reaching the
     *   route handler, which is why refund confirmations never worked
     *   even after a webhook URL was configured in the Paystack dashboard)
     * - api/notifications (the notification-delivery pg_cron job calling
     *   /api/notifications/deliver with its token, no cookie either)
     * Feel free to modify this pattern to include more paths.
     */
    // "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/((?!_next/static|_next/image|favicon.ico|api/mobile|api/observability|api/notifications|api/paystack/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
    //  '/((?!api|trpc|_next|_vercel|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
